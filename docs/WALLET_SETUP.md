# Wallet pass setup (Digital Business Card)

The card builder works without any of this. These steps turn on the two wallet
buttons. Each wallet is independent: set up one, both, or neither. Until its
variables are set, that wallet shows "not set up yet" in the Share tab.

All variables go in Vercel: Project, Settings, Environment Variables,
Production. Redeploy after adding them.

## Before anything else

1. Run `supabase/migrations/0029_business_cards.sql` in the Supabase SQL editor.
   It only adds new tables and functions.
2. The builder is visible to the admin account only. To open it to every
   member, set `CARD_BUILDER_PUBLIC=true`.
3. Optional: "email me when someone shares their details" needs
   `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` to be set. Without them the
   contact still lands in the Contacts tab; only the email is skipped.

## Apple Wallet

Needs a paid Apple Developer account (the account holder does steps 1 to 4).

1. In the Apple Developer portal, go to Certificates, Identifiers and Profiles,
   then Identifiers. Add a new **Pass Type ID**, for example
   `pass.org.milvector.card`.
2. On a Mac, open Keychain Access, then Certificate Assistant, then Request a
   Certificate From a Certificate Authority. Save the request to disk.
3. Back in the portal, open the Pass Type ID, choose Create Certificate, and
   upload that request. Download the resulting `pass.cer`.
4. Double-click `pass.cer` to add it to Keychain. Find it under My
   Certificates, expand it, select both the certificate and its private key,
   and export them as `pass.p12` with a password.
5. Convert to the two PEM files the site reads (any machine with OpenSSL):

       openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass-cert.pem -legacy
       openssl pkcs12 -in pass.p12 -nocerts -out pass-key.pem -legacy

   The second command asks for a new passphrase for the key. Remember it.
6. Download the Apple Worldwide Developer Relations certificate (the current
   "WWDR G4" certificate) from https://www.apple.com/certificateauthority/ and
   convert it:

       openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem

7. Set these variables. Each PEM can be pasted as is, or as base64 of the file
   (`base64 -w0 pass-cert.pem`) if pasting multi-line text is awkward.

   | Variable | Value |
   | --- | --- |
   | `APPLE_PASS_TYPE_ID` | The Pass Type ID, e.g. `pass.org.milvector.card` |
   | `APPLE_TEAM_ID` | The 10-character Team ID from the account's Membership page |
   | `APPLE_PASS_CERT` | Contents of `pass-cert.pem` |
   | `APPLE_PASS_KEY` | Contents of `pass-key.pem` |
   | `APPLE_PASS_KEY_PASSPHRASE` | The passphrase from step 5 |
   | `APPLE_WWDR_CERT` | Contents of `wwdr.pem` |

The Pass Type ID certificate expires after about a year. When it does, the
Apple button returns an error; repeat steps 2 to 5 and update the two
variables. Passes already in a wallet keep working.

The private key signs passes in MilVector's name. Treat `pass.p12` and
`pass-key.pem` like a password: do not email them or commit them.

## Google Wallet

Free. Needs a Google account.

1. Create a Google Wallet issuer account at https://pay.google.com/business/console
   and note the **Issuer ID**.
2. In Google Cloud Console, create (or pick) a project, enable the
   **Google Wallet API**, and create a **service account**. Create a JSON key
   for it and download the file.
3. In the Wallet console, open Users and invite the service account's email
   address with the Developer role.
4. Set these variables:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_WALLET_ISSUER_ID` | The Issuer ID |
   | `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
   | `GOOGLE_WALLET_PRIVATE_KEY` | `private_key` from the JSON key (pasted as is, or base64) |

5. A new issuer starts in demo mode: only accounts you add as test users in the
   Wallet console can save passes, and passes carry a "test only" label. To go
   live for everyone, request publishing access in the Wallet console. Google
   reviews the request.

## How to check it worked

Open the Share tab of a published card on the phone itself and tap the wallet
button. The pass should show the name, title, and a QR code that opens the
card. If a button returns an error instead, the response text says which
credential could not be read.
