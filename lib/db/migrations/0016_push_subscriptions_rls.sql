-- RLS for push_subscriptions (paired with 0015). Same posture as the rest of
-- 0014: deny-by-default, owner-scoped, Admin full; service-role server actions
-- bypass RLS. Closes the direct-PostgREST hole on the public anon key.

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ps:select"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "ps:insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "ps:update"
  ON public.push_subscriptions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "ps:delete"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');
