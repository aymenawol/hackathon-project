-- Add delete policy for sms_messages so old messages can be cleaned up
create policy "Anyone can delete sms_messages"
  on public.sms_messages for delete to anon using (true);
