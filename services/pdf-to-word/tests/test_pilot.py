"""Run inside the converter image: python -m unittest discover -s tests."""
import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from fastapi import BackgroundTasks, HTTPException, UploadFile
from app import main
from app.pipeline import ConversionError

class PilotLimits(unittest.IsolatedAsyncioTestCase):
    async def test_busy_worker_rejects_instead_of_queueing(self):
        slot = asyncio.Semaphore(1)
        await slot.acquire()
        with patch.object(main, '_conversion_slot', slot):
            with self.assertRaises(HTTPException) as error:
                await main.convert_pdf_to_word_endpoint(BackgroundTasks(), UploadFile(file=io.BytesIO(b'%PDF-'), filename='test.pdf'))
            self.assertEqual(error.exception.status_code, 429)
            self.assertEqual(error.exception.headers['Retry-After'], '10')

    async def test_oversize_upload_is_bounded(self):
        with patch.object(main, 'MAX_UPLOAD_BYTES', 4):
            with self.assertRaises(HTTPException) as error:
                await main._convert_file(BackgroundTasks(), UploadFile(file=io.BytesIO(b'%PDF-too-big'), filename='test.pdf'))
            self.assertEqual(error.exception.status_code, 413)

    async def test_conversion_failure_cleans_temporary_files(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(main.tempfile, 'gettempdir', return_value=folder), patch.object(main, 'run_in_threadpool', new=AsyncMock(side_effect=ConversionError('synthetic failure'))):
                with self.assertRaises(HTTPException) as error:
                    await main._convert_file(BackgroundTasks(), UploadFile(file=io.BytesIO(b'%PDF-synthetic'), filename='test.pdf'))
                self.assertEqual(error.exception.status_code, 422)
            self.assertEqual(list(Path(folder).iterdir()), [])

if __name__ == '__main__': unittest.main()
