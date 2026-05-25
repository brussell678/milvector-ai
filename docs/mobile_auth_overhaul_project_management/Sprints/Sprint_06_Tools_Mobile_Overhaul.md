# Sprint 06 Tools Mobile Overhaul

## Goal

Make AI tools usable on phones.

## Tasks

- Refactor each tool page to one-column mobile layout.
- Make forms full width.
- Add prominent generate/submit action.
- Improve results display.
- Add copy/download buttons where appropriate.
- Add collapsible guidance sections for long instructions.
- Run `npm run build`.

## Acceptance Criteria

- Every AI tool works on mobile.
- Outputs are readable.
- Long forms do not feel cramped.
- Copy/download actions work where implemented.

## Closeout Notes

Completed on 2026-05-25.

- Converted JD Decoder and MOS Translator to the shared app page shell with mobile-first hero guidance, section cards, full-width mobile actions, and readable result panels.
- Added copy actions to the master resume generator, legacy FITREP bullets flow, targeted resume output, and LinkedIn profile package output.
- Improved generated resume previews with bounded mobile-friendly scroll areas and more readable line height.
- Improved LinkedIn builder mobile controls with stacked primary actions and a horizontally scrollable workspace tab bar.
- Collapsed the long integrated-tools-vs-GPT-links guidance on the tools index so mobile users reach tool cards faster.
- Verified with `npm run lint` and `npm run build`.
