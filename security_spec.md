# SkyDrop Royale (Apex Rush Database) — Firestore Security Specification

## 1. Existing Collections Preserved (Non-Destructive)
1. **`/users/{userId}`** & **`/users/{userId}/ghosts/{trackId}`** & **`/trackRecords/{recordId}`**:
   - Fully preserved so no existing user profiles, ghosts, or track records are deleted or broken.

## 2. Battle Royale Collections
1. **Players (`/players/{playerId}`)**:
   - `playerId` must match `^[a-zA-Z0-9_\-]+$` (length `<= 128`).
   - Verified signed-in users (`isVerifiedSignedIn()`) may read player profiles (containing only public non-PII gamer `username`, `avatar`, `level`, `xp`, `wins`, `kills`, `coins`, `matchesPlayed`, `battlePassTier`, `battlePassPremium`, `loadout`, `quests`) for global leaderboards and friend lookups (`allow list: if isVerifiedSignedIn() && resource.data.level >= 1`). No email/PII stored on `/players`.
   - Only the owner (`request.auth.uid == playerId`) may `create` or `update` their own player document (`ownerId == request.auth.uid`), with `createdAt == request.time`, `updatedAt == request.time`, immutable `ownerId`/`createdAt`, and strict field/type/range checks.
2. **Matches (`/matches/{matchId}`)**:
   - Stores match history (`match_id`, `mode`, `players`, `winner`, `started_at`, `ended_at`, `createdBy`, `createdAt`, `updatedAt`).
   - Verified signed-in users may `get`/`list` matches (`resource.data.players.size() >= 1`) and `create` match records where `createdBy == request.auth.uid` and `players.size() <= 100`. Immutable once recorded (`update`/`delete` denied).
3. **Inventory (`/inventory/{entryId}`)**:
   - Owner-isolated cosmetic & locker inventory (`player_id`, `item_id`, `item_type`, `equipped`, `createdAt`, `updatedAt`).
   - Only `player_id == request.auth.uid` may read, create, update (`equipped` toggle), or delete.
4. **Shop Items (`/shop_items/{itemId}`)**:
   - Catalog of daily shop cosmetics (`item_id`, `name`, `price`, `rarity`, `type`).
   - Verified signed-in users may read (`allow list: if isVerifiedSignedIn() && resource.data.price >= 0`), client writes denied (`false`) to prevent price tampering.
5. **Friends (`/friends/{friendshipId}`)**:
   - Social links (`player_id`, `friend_id`, `friend_name`, `status`, `createdAt`, `updatedAt`).
   - Only participants (`request.auth.uid == resource.data.player_id || request.auth.uid == resource.data.friend_id`) can read, update `status`, or delete; only `player_id == request.auth.uid` can create.

## 3. Adversarial Test Vectors
1. Unauthenticated read/write on `/players/{uid}`, `/inventory/{id}`, `/friends/{id}`, `/matches/{id}` -> `PERMISSION_DENIED`.
2. Cross-user update on `/players/{otherUid}` or `/inventory/{otherItem}` -> `PERMISSION_DENIED`.
3. Client price tampering (`create`/`update` on `/shop_items/{id}`) -> `PERMISSION_DENIED`.
4. Shadow field injection (`isAdmin: true`) on `/players`, `/matches`, `/inventory`, `/friends` -> `PERMISSION_DENIED`.
5. Unbounded array (`players` > 100 on `/matches`) or invalid mode/rarity/status enum -> `PERMISSION_DENIED`.
6. Timestamp spoofing (`createdAt != request.time`) or immutable `ownerId`/`player_id` mutation -> `PERMISSION_DENIED`.
