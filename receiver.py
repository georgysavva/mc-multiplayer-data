import argparse
import array
import fcntl  # 用于获取socket缓冲区信息
import json
import os
import socket
import time
import traceback
from pathlib import Path
from queue import Empty, Queue
from threading import Thread

import cv2
import numpy as np

HOST = ""
PORT = 8089


def process_frame_worker(frame_queue, output_path):
    action_data = []
    frames = []
    out = None

    while True:
        try:
            data = frame_queue.get(timeout=5)
            if data is None:  # 结束信号
                break

            img, pos = data
            img_count = pos.get("frame_count", 0)

            # x,y,z,yaw,pitch 保留三位小数
            pos["x"] = round(pos["x"], 3)
            pos["y"] = round(pos["y"], 3)
            pos["z"] = round(pos["z"], 3)
            pos["yaw"] = round(pos["yaw"], 3)
            pos["pitch"] = round(pos["pitch"], 3)

            pos["extra_info"] = {
                "seed": 42,
            }
            action_data.append(pos)

            # Store frames for later processing
            if img is None:
                print(f"Error: Received None image at frame {img_count}")
                continue
            if not isinstance(img, np.ndarray):
                print(f"Error: Invalid image type at frame {img_count}: {type(img)}")
                continue
            if img.size == 0:
                print(f"Error: Empty image at frame {img_count}")
                continue

            frames.append(img)

        except Empty:
            # print("Frame queue timeout (no new frames in 5 seconds)")
            continue
        except Exception as e:
            print(
                f"Error processing frame {img_count if 'img_count' in locals() else 'unknown'}:"
            )
            print(f"  Error type: {type(e).__name__}")
            print(f"  Error message: {str(e)}")
            print(f"  Data type: {type(data) if 'data' in locals() else 'unknown'}")
            if "img" in locals():
                print(f"  Image type: {type(img)}")
                print(
                    f"  Image shape: {img.shape if hasattr(img, 'shape') else 'no shape'}"
                )
            continue

    # Calculate real FPS and cap at 20
    print("Total frames processed:", len(action_data))
    if len(action_data) > 1:
        real_fps = len(action_data) / (
            (action_data[-1]["renderTime"] - action_data[0]["renderTime"]) / 1000
        )
        video_fps = min(real_fps, 20)
    else:
        real_fps = 0
        video_fps = 20

    print("Real FPS:", real_fps)
    print("Video FPS (capped at 20):", video_fps)

    # Now create video writer with calculated FPS and write all frames
    out = cv2.VideoWriter(
        f"{output_path}.mp4",
        cv2.VideoWriter_fourcc(*"mp4v"),
        video_fps,
        (640, 360),
    )

    for frame in frames:
        out.write(frame)

    # 清理工作
    out.release()
    with open(output_path + ".json", "w") as f:
        json.dump(action_data, f)
    print("saved to ", f"{output_path}.mp4")


def recvall(sock, count):
    buf = b""
    total_received = 0
    while count:
        try:
            newbuf = sock.recv(count)
            if not newbuf:
                return None
            received = len(newbuf)
            total_received += received
            buf += newbuf
            count -= received
        except socket.error as e:
            return None
    return buf


def recvint(sock):
    return int.from_bytes(recvall(sock, 4), byteorder="little")


def get_recv_buffer_used(sock):
    buf = array.array("i", [0])
    fcntl.ioctl(sock.fileno(), 0x541B, buf)  # FIONREAD
    return buf[0]


# 解析命令行参数
argparser = argparse.ArgumentParser(description="Receiver script")
argparser.add_argument("--name", type=str, required=True, help="minecraft bot name")
argparser.add_argument(
    "--start_id",
    type=int,
    default=0,
    help="Starting number for incremental file naming",
)
argparser.add_argument("--port", type=int, default=8089, help="Port number")
argparser.add_argument("--output_path", type=str, required=True, help="output path")
argparser.add_argument(
    "--instance_id",
    type=int,
    required=True,
    help="Instance ID for distinguishing parallel runs",
)

args = argparser.parse_args()
PORT = args.port

# 创建输出目录

# 设置socket

if not os.path.exists(args.output_path):
    os.makedirs(args.output_path)
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
print(f"Socket created at {PORT} for {args.name}")

s.bind((HOST, PORT))
print("Socket bind complete")
s.listen(10)
print("Socket now listening")

id = args.start_id
while True:

    # 创建帧处理队列
    frame_queue = Queue()
    output_path = (
        f"{args.output_path}/{id:06d}_{args.name}_instance_{args.instance_id:03d}"
    )

    # 启动后台处理进程
    processor = Thread(target=process_frame_worker, args=(frame_queue, output_path))
    processor.daemon = True
    processor.start()
    try:
        conn, addr = s.accept()
    except socket.timeout:
        print("No connection received within 60 seconds, exiting...")
        s.close()
        exit(1)

    # conn.settimeout(10)
    conn.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024 * 1024)  # 1MB
    print(f"Socket connected {id}")

    img_count = 0
    retcode = 0
    try:
        while True:
            t0 = time.time()
            try:
                pos_length = recvint(conn)
            except Exception as e:
                pos_length = 0
            if pos_length == 0:
                print(f"recv 0 length, normal end. {id}")
                retcode = 0
                break

            pos_data = recvall(conn, pos_length)
            if pos_data is None:
                print("Error receiving position data")
                retcode = 1
                break
            print("pos data: ", pos_data.decode("utf-8"))
            pos = json.loads(pos_data.decode("utf-8"))
            pos["frame_count"] = img_count
            # pos = {
            #     "x": 0,
            #     "y": 0,
            #     "z": 0,
            #     "yaw": 0,
            #     "pitch": 0,
            #     "frame_count": img_count,
            # }
            length = recvint(conn)
            if length == 0:
                print("ERROR! recv 0 image length")
                retcode = 1
                break

            stringData = recvall(conn, int(length))
            if stringData is None:
                print("[Error] Received None instead of valid image data")
                retcode = 1
                break

            img_count += 1
            img = cv2.imdecode(
                np.frombuffer(stringData, dtype=np.uint8), cv2.IMREAD_UNCHANGED
            )
            try:
                frame_queue.put((img, pos))
            except Queue.Full:
                print("Queue full, dropping frame")
            continue

            # print(f"Processed in {(t1 - t0)*1000:.2f}ms")

    except socket.timeout:
        print("Socket timeout")
        retcode = 1
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        retcode = 1
    finally:
        frame_queue.put(None)
        processor.join()
        conn.close()
        id += 1
