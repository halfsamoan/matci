from pathlib import Path
import sys
import tempfile
import unittest

try:
    import fcntl
except ImportError:
    fcntl = None


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
try:
    from doctor import worker_lock_held
finally:
    sys.path.remove(str(ROOT / 'tools'))


@unittest.skipIf(fcntl is None, 'POSIX flock is unavailable')
class DoctorLockTests(unittest.TestCase):
    def test_missing_lock_is_reported_unlocked_without_creating_it(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(worker_lock_held(directory))
            self.assertFalse((Path(directory) / 'worker.lock').exists())

    def test_existing_worker_lock_is_reported_held(self):
        with tempfile.TemporaryDirectory() as directory:
            lock_path = Path(directory) / 'worker.lock'
            with lock_path.open('wb') as lock_file:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertTrue(worker_lock_held(directory))
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                self.assertFalse(worker_lock_held(directory))


if __name__ == '__main__':
    unittest.main()
