# ELIFORA Pass 5B: Auth and first entry

This source slice starts from accepted Pass 5A `8a79f95dd2385f0e4e697268684659ad4b1920f7`. It changes entry presentation and page routing, without changing membership lifecycle, API contracts, schema, provider configuration or deployment. Repository migrations remain 116, headed by `20261101142658`.

## Entry and authority

Normal provider authentication leads to `/entry`, which reads fresh server workspace contexts. Existing valid active access takes priority; one context retains automatic selection, multiple use the existing selector. With no active context, only the accepted own-invitation read service discovers pending invitations. An authenticated identity with neither gets an explicit no-access screen.

`/invitations` and `/invite/[membershipId]` show only the safe Pass 5A recipient projection. A locator is navigation, never authorization. Foreign, absent and malformed locators have neutral presentation after authentication. The client acceptance body contains only `request_id`; the synchronous in-flight guard suppresses double clicks and uncertain retries reuse that ID. Only canonical ACTIVE confirmation plus fresh matching membership contexts enables continuation. Existing workspace authorization runs again at the destination.

Initial OWNER provisioning remains the controlled `pilot_provision` operator path. Owners do not accept an invitation to enter their already active workspace. The optional owner-only `/welcome` guide reads actual salon configuration and links existing settings, team and stock screens; it stores no completion flag, percentage or new organization/member data. The accepted Today destination and normal context selection remain unchanged.

## Presentation and privacy

Ivory, plum and copper entry screens reuse the approved integrated f/brush files. Sign In retains its exact existing intro component and timing. Labels, current/new-password autocomplete, reveal buttons, live feedback and visible focus support keyboard and mobile entry. Forms remain in document flow with no sticky keyboard obstruction. Recover-request wording acknowledges the request without claiming mail delivery. Password policy and recovery/revocation server actions are unchanged.

Known authorization/session codes receive distinct safe presentation. Only page guards translate existing AccessErrors to entry pages; domain/API guards and HTTP authorization are unchanged. A previous workspace cookie is only a presentation hint after the normal guard rejects identity, so provider cookie cleanup does not mislabel a lost session as first-time anonymous entry. It never grants access. Sign-in redirect checks the existing identity-only workspace RPC so provider-valid but server-revoked sessions do not loop through the signed-in redirect. Private entry surfaces hide stale context after privacy/offline/background signals until a fresh server render. Recovery keeps its action owner mounted across the server cookie-deletion render, preserving only a real completion/revocation result and removing password fields after completion.

## Review evidence

The delivery evidence measures aggregate `.next/static` raw and deterministic gzip bytes against the accepted Pass 5A production build using the unchanged pinned lockfile. This is aggregate static output, not a per-navigation download claim. No form/animation/image framework or additional Auth SDK was installed. The browser gate additionally checks sign-in input boundary contrast at 3:1 or better, guarding against the old intro stylesheet overriding the new accessible border color.

`e2e/auth-productization.spec.ts` uses normal local provider Auth, the legitimate `CREATE_MEMBER` source, accepted invitation services and real local RLS. Its strict CI step runs both configured browser projects with zero retries. Required 1440/390/320 screenshots are retained in `visual-productization-pass-5b`; no trace, storage-state file, secret or credential artifact is uploaded. Admin tools are confined to the disposable local fixture, provider recovery setup and explicit revocation/archive setup; invited memberships are never directly activated.

Focused tests protect routing priority, human error presentation, safe return destinations, minimal/idempotent acceptance, fresh-context matching, private-context revalidation, password controls and revoked-session redirect behavior. Existing Pass 5A DB/RLS, race, invitation browser and full regression gates remain intact. Final delivery must record the exact green application SHA, complete CI results, measured production bundle delta and actual screenshot self-review; this implementation note is not itself a completion claim.

## Preserved external gates

This pass does not deploy or migrate canonical staging, modify Vercel ALL_SSO, publish a catalog, enable signup, implement SMTP, change DNS, touch production or alter the persistent manual staging account. Hosted email/invite/recovery, privacy/retention/legal approval, colorist review, support ownership and every other Phase 10 human/external gate retain their OPEN / BLOCKED_EXTERNAL_DEPENDENCY status. Local provider recovery tests are not hosted mail evidence. No Pilot GO or Phase 11 is authorized by this slice.
