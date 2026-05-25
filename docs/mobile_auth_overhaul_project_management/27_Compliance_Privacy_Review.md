# 27 Compliance Privacy Review

## Privacy Considerations

- Users may upload military records and resume documents.
- Upload warnings must instruct users to redact SSN, full date of birth, and home address.
- Profile information must remain private to the authenticated user.
- Admin-only review tools must remain protected.

## Auth Considerations

- Password auth must use Supabase Auth.
- Passwords must never be stored manually in application tables.
- Password reset must use Supabase reset flow.
- Magic link must remain available.

## Data Handling

- Do not expose service role keys to client code.
- Preserve RLS.
- Avoid logging raw document text in client-visible places.

