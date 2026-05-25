# Sprint 08 Forms and Upload Warnings

## Goal

Make all forms safe and mobile usable.

## Required Upload Warning

Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.

## Tasks

- Review all upload interfaces.
- Add required upload warning.
- Make forms single-column on mobile.
- Improve validation and error states.
- Ensure submit buttons are thumb-friendly.
- Run `npm run build`.

## Acceptance Criteria

- Warning appears on every upload interface.
- Forms are usable on mobile.
- Validation messages are clear.
- No upload interface lacks redaction guidance.

## Closeout Notes

Completed on 2026-05-25.

- Added a shared `UploadWarning` component with the required redaction warning text.
- Applied the shared warning to Documents upload, Library submission upload, and Feedback attachment upload.
- Improved Documents upload mobile actions and selected-file display.
- Added a mobile card layout for uploaded documents while preserving the existing desktop table.
- Improved full-width mobile submit/refresh actions on Feedback and Profile forms.
- Verified with `npm run lint` and `npm run build`.
