# orchestrator/utils/task_queue.py
import asyncio
import logging
import time
from typing import Callable, Any, Dict

class QueueMetrics:
    def __init__(self):
        self.queue_events: Dict[str, int] = {
            "queued": 0,
            "processed": 0,
            "rejected": 0,
            "failed": 0
        }
        self.process_times: list = []
        self.current_queue_size = 0
    
    def on_queued(self, queue_name: str):
        self.queue_events["queued"] += 1
        logging.info(f"Task queued in {queue_name}. Total queued: {self.queue_events['queued']}")
    
    def on_processed(self, queue_name: str, processing_time: float):
        self.queue_events["processed"] += 1
        self.process_times.append(processing_time)
        logging.info(f"Task processed in {queue_name}. Processing time: {processing_time:.2f}s")
    
    def on_rejected(self, queue_name: str):
        self.queue_events["rejected"] += 1
        logging.warning(f"Task rejected in {queue_name}. Total rejected: {self.queue_events['rejected']}")
    
    def on_failed(self, queue_name: str):
        self.queue_events["failed"] += 1
        logging.error(f"Task failed in {queue_name}. Total failed: {self.queue_events['failed']}")
    
    def get_stats(self) -> Dict[str, Any]:
        avg_process_time = sum(self.process_times) / len(self.process_times) if self.process_times else 0
        return {
            **self.queue_events,
            "current_queue_size": self.current_queue_size,
            "avg_process_time": avg_process_time
        }

class TaskQueue:
    def __init__(self, name: str, num_workers: int = 3, metrics: QueueMetrics = None, max_size: int = 100):
        self.name = name
        self.num_workers = num_workers
        self.max_size = max_size
        self.metrics = metrics or QueueMetrics()
        self.queue = None
        self.workers_started = False
        self.worker_tasks = []
        
        logging.info(f"Initialized TaskQueue '{name}' with {num_workers} workers, max size: {max_size}")
    
    def ensure_queue(self):
        """Ensure queue is created."""
        if self.queue is None:
            self.queue = asyncio.Queue(maxsize=self.max_size)
    
    def update_queue_size(self):
        """Update current queue size metric."""
        if self.queue:
            self.metrics.current_queue_size = self.queue.qsize()
    
    async def add_task(self, task_func: Callable, *args, **kwargs) -> bool:
        """Add a task to the queue. Returns True if added successfully."""
        try:
            # Ensure queue exists
            self.ensure_queue()
            if not self.workers_started:
                await self.start_worker()
            
            task_item = (task_func, args, kwargs, time.time())
            
            # Non-blocking put with timeout
            try:
                self.queue.put_nowait(task_item)
                self.metrics.on_queued(self.name)
                self.update_queue_size()
                return True
            except asyncio.QueueFull:
                self.metrics.on_rejected(self.name)
                logging.warning(f"Queue {self.name} is full, task rejected")
                return False
                
        except Exception as e:
            logging.error(f"Error adding task to queue {self.name}: {e}")
            self.metrics.on_rejected(self.name)
            return False
    
    async def start_worker(self):
        """Start worker tasks if not already started."""
        if self.workers_started:
            return
        
        for i in range(self.num_workers):
            worker_task = asyncio.create_task(self._worker(f"worker-{i}"))
            self.worker_tasks.append(worker_task)
        
        self.workers_started = True
        logging.info(f"Started {self.num_workers} workers for queue {self.name}")
    
    async def _worker(self, worker_name: str):
        """Worker coroutine that processes tasks from the queue."""
        logging.info(f"Worker {worker_name} started for queue {self.name}")
        
        while True:
            try:
                # Get task from queue
                task_func, args, kwargs, queued_time = await self.queue.get()
                wait_time = time.time() - queued_time
                start_time = time.time()
                
                logging.info(f"Worker {worker_name} processing task (waited {wait_time:.2f}s in queue)")
                
                try:
                    # Execute the task
                    if asyncio.iscoroutinefunction(task_func):
                        await task_func(*args, **kwargs)
                    else:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, lambda: task_func(*args, **kwargs))
                    
                    processing_time = time.time() - start_time
                    self.metrics.on_processed(self.name, processing_time)
                    
                except Exception as e:
                    logging.error(f"Worker {worker_name} task execution failed: {e}", exc_info=True)
                    self.metrics.on_failed(self.name)
                
                finally:
                    self.queue.task_done()
                    self.update_queue_size()
                    
            except Exception as e:
                logging.error(f"Worker {worker_name} error: {e}", exc_info=True)
                await asyncio.sleep(1)
    
    async def shutdown(self):
        """Gracefully shutdown the task queue."""
        logging.info(f"Shutting down task queue {self.name}")
        
        if self.queue:
            # Wait for current tasks to complete
            await self.queue.join()
        
        # Cancel worker tasks
        for task in self.worker_tasks:
            task.cancel()
        
        # Wait for workers to finish
        if self.worker_tasks:
            await asyncio.gather(*self.worker_tasks, return_exceptions=True)
        
        logging.info(f"Task queue {self.name} shutdown complete")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        queue_size = self.queue.qsize() if self.queue else 0
        return {
            "queue_name": self.name,
            "queue_size": queue_size,
            "num_workers": self.num_workers,
            "workers_started": self.workers_started,
            **self.metrics.get_stats()
        }