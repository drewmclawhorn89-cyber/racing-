# Apex Rush Racing — Firestore Security Specification

## 1. Collections & Ownership Model
1. **`/users/{userId}`**:
   - Owner-isolated driver profile storing progression (`coins`, `xp`, `wins`), garage unlocks (`unlockedCars`, `custom`), game preferences (`weather`, `volume`, `muted`, `touch`, `cameraMode`, `laps`, `difficulty`), and personal per-track lap records (`leaderboards`).
   - Only verified authenticated owners (`request.auth.uid == userId && request.auth.token.email_verified == true`) can `get`, `create`, or `update` their own document. Directory `list` and `delete` are denied (`false`).
   - All 22 schema keys, numeric bounds, enum constraints, immutable `ownerId` / `createdAt`, and server timestamps (`request.time`) are enforced.
2. **`/users/{userId}/ghosts/{trackId}`**:
   - Owner-isolated Time Trial ghost replay path (`trackId` in `['city', 'desert', 'mountain', 'coastal']`, flattened `coords` bounded to `<= 5400`).
   - Requires verified ownership and parent `/users/{userId}` profile existence.
3. **`/trackRecords/{recordId}`**:
   - Global circuit lap record entries (`userId`, `driverName`, `trackId`, `carName`, `mode`, `time`, `createdAt`, `updatedAt`).
   - Verified signed-in drivers may `get`/`list` (`resource.data.time > 1`) leaderboard records, `create` records owned by `request.auth.uid`, and `update`/`delete` only their own records (`existing().userId == request.auth.uid`).

## 2. Adversarial Test Vectors
1. Unauthenticated read/write on `/users/{uid}`, `/users/{uid}/ghosts/{trackId}`, or `/trackRecords/{id}` -> `PERMISSION_DENIED`.
2. Cross-user `get` or `update` on `/users/{otherUid}` or `update`/`delete` on another driver's `/trackRecords/{id}` -> `PERMISSION_DENIED`.
3. Shadow field injection (`isAdmin: true`) or missing required profile keys -> `PERMISSION_DENIED`.
4. Unbounded arrays (`unlockedCars > 12`, `leaderboards[track] > 10`, `coords > 5400`) or invalid enums (`selectedTrack`, `weather`, `touch`, `difficulty`, `mode`) -> `PERMISSION_DENIED`.
5. Timestamp spoofing (`createdAt != request.time`) or immutable `ownerId`/`userId`/`createdAt` mutation -> `PERMISSION_DENIED`.
