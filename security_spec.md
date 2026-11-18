# Apex Rush Racing — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Owner-Only Profile & PII Isolation (`/users/{userId}`)**:
   - Only a verified Google-authenticated user (`request.auth.uid == userId && request.auth.token.email_verified == true`) may `get`, `create`, or `update` their own profile document.
   - `list` queries on `/users` are strictly forbidden (`allow list: if false`) so PII (`email`, `photoURL`) cannot be scraped.
   - `ownerId` and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
   - Profile persists all driver state: progression (`coins`, `xp`, `wins`), garage (`selectedCar`, `unlockedCars`, `custom`), track/race preferences (`selectedTrack`, `onlineName`, `weather`, `volume`, `muted`, `touch`, `cameraMode`, `laps`, `difficulty`), and personal `leaderboards` (up to 10 records per track).
2. **Owner-Only Ghost Replays (`/users/{userId}/ghosts/{trackId}`)**:
   - Master Gate enforces `exists(/databases/$(database)/documents/users/$(userId))` and `isOwner(userId)` on single-document writes.
   - `trackId` must be one of `['city', 'desert', 'mountain', 'coastal']`.
   - `coords` is a strictly bounded list of numbers (`<= 5400`, up to 1800 `[x, z, h]` samples).
   - `ownerId` and `createdAt` are immutable after creation; timestamps must equal `request.time`.
3. **Track Leaderboard Integrity (`/trackRecords/{recordId}`)**:
   - No PII (`email`, `phone`) is permitted on `trackRecords`.
   - `recordId` must match `^[a-zA-Z0-9_\-]+$` (length `<= 128`).
   - Only verified authenticated users may read or submit records, and a user may only create/update records where `userId == request.auth.uid`.
   - `list` queries explicitly validate `resource.data.time > 1`.

## 2. Adversarial Test Vectors ("Dirty Dozen")
1. Unauthenticated `get` / `create` on `/users/uid1` -> `PERMISSION_DENIED`
2. Unverified email token (`email_verified: false`) writing `/users/uid1` -> `PERMISSION_DENIED`
3. Cross-user read (`uid2` reading `/users/uid1` or `/users/uid1/ghosts/city`) -> `PERMISSION_DENIED`
4. Cross-user list query (`list /users` or `uid2` listing `/users/uid1/ghosts`) -> `PERMISSION_DENIED`
5. Identity spoofing (`uid1` creating `/users/uid1` with `ownerId: "uid2"`) -> `PERMISSION_DENIED`
6. Shadow field injection (`isAdmin: true` on `/users/uid1`, `/users/uid1/ghosts/city`, or `/trackRecords/rec1`) -> `PERMISSION_DENIED`
7. Oversized ID / resource exhaustion (`recordId` > 128 chars or invalid `trackId` on `/users/uid1/ghosts/evil`) -> `PERMISSION_DENIED`
8. Unbounded array (`unlockedCars` length 13, `coords` length 5401, or non-number element in `coords`) -> `PERMISSION_DENIED`
9. Fake client timestamp (`createdAt != request.time` or `updatedAt != request.time`) -> `PERMISSION_DENIED`
10. Immutable field mutation (`ownerId` or `createdAt` changed on update) -> `PERMISSION_DENIED`
11. Invalid lap time (`time: -5` or `time: 0` or `time: "fast"`) -> `PERMISSION_DENIED`
12. Cross-user leaderboard overwrite (`uid2` updating `trackRecords` owned by `uid1`) -> `PERMISSION_DENIED`
