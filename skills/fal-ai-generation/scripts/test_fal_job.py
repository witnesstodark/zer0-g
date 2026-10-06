import argparse,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('fal_job',Path(__file__).with_name('fal_job.py'))
job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
class QueueTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='fal-skill-test-');self.base=Path(self.temp.name)
  self.input=self.base/'input.json';self.input.write_text('{"prompt":"a brass robot"}',encoding='utf-8')
  self.args=argparse.Namespace(endpoint='example/model',input=str(self.input),out=str(self.base/'run'),dry_run=False,env=None)
 def tearDown(self):self.temp.cleanup()
 def test_dry_run_never_loads_sdk_or_writes_receipt(self):
  self.args.dry_run=True
  with patch.object(job,'client',side_effect=AssertionError('SDK must not load')):
   self.assertTrue(job.submit(self.args)['dry_run'])
  self.assertFalse((self.base/'run').exists())
 def test_existing_receipt_blocks_duplicate_submission(self):
  sdk=Mock();sdk.submit.return_value.request_id='demo-request'
  job.submit(self.args,sdk)
  with self.assertRaises(ValueError):job.submit(self.args,sdk)
  sdk.submit.assert_called_once()
 def test_uncertain_submission_keeps_guard(self):
  sdk=Mock();sdk.submit.side_effect=RuntimeError('private provider details')
  with self.assertRaisesRegex(RuntimeError,'outcome is unknown'):job.submit(self.args,sdk)
  saved=job.read_json(self.base/'run/job.json');self.assertEqual(saved['status'],'submission_unknown')
  self.assertNotIn('private provider details',json.dumps(saved))
  with self.assertRaises(ValueError):job.submit(self.args,sdk)
  sdk.submit.assert_called_once()
 def test_processing_result_never_fetches_or_resubmits(self):
  sdk=Mock();sdk.Completed=type('Completed',(),{});sdk.InProgress=type('InProgress',(),{});sdk.Queued=type('Queued',(),{})
  sdk.status.return_value=sdk.InProgress()
  receipt=self.base/'job.json';job.save_json(receipt,{'endpoint_id':'example/model','request_id':'demo'})
  args=argparse.Namespace(command='result',job=str(receipt),env=None)
  self.assertEqual(job.resume(args,sdk)['status'],'IN_PROGRESS')
  sdk.result.assert_not_called();sdk.submit.assert_not_called()
 def test_completed_provider_error_is_not_downloaded(self):
  sdk=Mock();sdk.Completed=type('Completed',(),{});sdk.InProgress=type('InProgress',(),{});sdk.Queued=type('Queued',(),{})
  sdk.status.return_value=sdk.Completed();sdk.result.return_value={'error':'model failed'}
  receipt=self.base/'job.json';job.save_json(receipt,{'endpoint_id':'example/model','request_id':'demo'})
  with patch.object(job,'download_result') as download:
   with self.assertRaisesRegex(RuntimeError,'Provider returned an error'):job.resume(argparse.Namespace(command='result',job=str(receipt),env=None),sdk)
   download.assert_not_called()
 def test_nested_models_and_material_maps_are_discovered(self):
  result={'images':[{'url':'https://example.invalid/normal.png','map_type':'normal'}],'model_urls':{'glb':'https://example.invalid/model.glb'},'text':'ordinary prose'}
  self.assertEqual([v['url'] for v in job.media_urls(result)],['https://example.invalid/normal.png','https://example.invalid/model.glb'])
 def test_saved_result_does_not_require_provider_history(self):
  receipt=self.base/'job.json';job.save_json(receipt,{'endpoint_id':'example/model','request_id':'demo'})
  job.save_json(self.base/'result.json',{'description':'Completed text result'})
  with patch.object(job,'client',side_effect=AssertionError('No provider request should be needed')):
   result=job.resume(argparse.Namespace(command='result',job=str(receipt),env=None))
  self.assertEqual(result['status'],'result_saved');self.assertEqual(result['review'],'pending')
 def test_placeholder_is_not_submitted(self):
  self.input.write_text('{"image_urls":["https://example.invalid/input.png"]}',encoding='utf-8')
  sdk=Mock()
  with self.assertRaises(ValueError):job.submit(self.args,sdk)
  sdk.submit.assert_not_called()
if __name__=='__main__':unittest.main()
