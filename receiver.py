import socket
import cv2
import numpy as np

HOST = ''
PORT = 8089

def recvall(sock, count):
    buf = b''
    while count:
        newbuf = sock.recv(count)
        if not newbuf: return None
        buf += newbuf
        count -= len(newbuf)
    return buf

def recvint(sock): return int.from_bytes(recvall(sock, 4), byteorder='little')

print('before Socket created')
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
print('Socket created')

s.bind((HOST,PORT))
print('Socket bind complete')
s.listen(10)
print('Socket now listening')

conn, addr=s.accept()

print('Socket connected')

out = cv2.VideoWriter('/output/out.mp4', cv2.VideoWriter_fourcc(*'XVID'), 20, (512, 512))
i=0
while i<250:
    length = recvint(conn)
    stringData = recvall(conn, int(length))
    img = cv2.imdecode(np.fromstring(stringData, dtype = np.uint8), cv2.IMREAD_UNCHANGED)

    # example processing
    edges = cv2.Canny(img, 100, 200)
    print("receive frame")

    out.write(img)
    i += 1
print('finished')
out.release()