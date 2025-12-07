"""CPU pinning utilities for distributing workloads across cores.

These functions help with:
- Calculating CPU core ranges for parallel instances
- Generating cpuset strings for Docker container pinning
- Excluding system cores (physical core 0) from workloads
"""


def calculate_cpu_ranges(
    total_cpus: int, num_instances: int
) -> list[tuple[int, int]]:
    """Calculate CPU core ranges for each instance.

    Returns a list of (start_cpu, end_cpu) tuples for each instance.
    Cores are distributed as evenly as possible.
    """
    if num_instances <= 0:
        return []

    cores_per_instance = total_cpus // num_instances
    extra_cores = total_cpus % num_instances

    ranges = []
    current_cpu = 0

    for i in range(num_instances):
        # Give one extra core to the first 'extra_cores' instances
        instance_cores = cores_per_instance + (1 if i < extra_cores else 0)
        if instance_cores > 0:
            start_cpu = current_cpu
            end_cpu = current_cpu + instance_cores - 1
            ranges.append((start_cpu, end_cpu))
            current_cpu = end_cpu + 1
        else:
            # If we have more instances than cores, some get no cores, so raise an error
            raise ValueError(f"Not enough cores to distribute to {num_instances} instances")

    return ranges


def get_physical_core0_cpus() -> set[int]:
    """Read logical CPUs tied to physical core 0 from sysfs.

    Physical core 0 typically handles system interrupts, so it's often
    beneficial to exclude it from CPU-intensive workloads.
    """
    with open("/sys/devices/system/cpu/cpu0/topology/thread_siblings_list") as f:
        return set(int(c) for c in f.read().strip().split(","))


def cpuset_string(start_cpu: int, end_cpu: int) -> str:
    """Generate a cpuset string from start and end CPU indices.

    Args:
        start_cpu: Starting CPU index (inclusive)
        end_cpu: Ending CPU index (inclusive)

    Returns:
        A cpuset string like "0-3" or "5" (if start == end)
    """
    if start_cpu == end_cpu:
        return str(start_cpu)
    return f"{start_cpu}-{end_cpu}"


def cpuset_string_excluding(start_cpu: int, end_cpu: int, exclude: set[int]) -> str:
    """Generate a cpuset string excluding specific cores.

    Args:
        start_cpu: Starting CPU index (inclusive)
        end_cpu: Ending CPU index (inclusive)
        exclude: Set of CPU indices to exclude

    Returns:
        A cpuset string with excluded cores removed, like "1,2,4,5"
    """
    cpus = [c for c in range(start_cpu, end_cpu + 1) if c not in exclude]
    if not cpus:
        return cpuset_string(start_cpu, end_cpu)
    return ",".join(str(c) for c in cpus)


def split_cpu_range(
    start_cpu: int, end_cpu: int
) -> tuple[tuple[int, int], tuple[int, int]]:
    """Split a CPU range into two halves for camera alpha and bravo.

    Args:
        start_cpu: Starting CPU index (inclusive)
        end_cpu: Ending CPU index (inclusive)

    Returns:
        A tuple of two (start, end) tuples representing the two halves
    """
    mid = (start_cpu + end_cpu) // 2
    return ((start_cpu, mid), (min(mid + 1, end_cpu), end_cpu))


def get_no_hyper_threading_cpu_ranges(
    total_cpus: int, num_instances: int
) -> list[tuple[int, int]]:
    """Calculate CPU core ranges using only second logical cores (no hyperthreading).

    On systems with hyperthreading, this uses only the latter half of all available
    CPU cores, which corresponds to the second logical core of each physical core.
    The first logical cores are ignored to avoid hyperthreading interference.

    Args:
        total_cpus: Total number of logical CPUs on the system
        num_instances: Number of instances to distribute across

    Returns:
        A list of (start_cpu, end_cpu) tuples for each instance (same format as
        calculate_cpu_ranges)
    """
    usable_start = total_cpus // 2
    usable_cpus = total_cpus - usable_start
    ranges = calculate_cpu_ranges(usable_cpus, num_instances)
    # Offset the ranges to start from usable_start
    return [(start + usable_start, end + usable_start) for start, end in ranges]
