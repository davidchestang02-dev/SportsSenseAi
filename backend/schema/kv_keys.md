# SportsSenseAi KV Keys

`schedule:{date}`
Stores the MLB slate payload for a single date.

`lineups:{date}:{game_id}`
Stores projected or confirmed batting orders.

`game-context:{date}:{game_id}`
Stores weather, park, bullpen, and umpire context.

`simulation:{date}:{game_id}`
Stores blended player, team, and game simulation outputs.

`market:{date}`
Stores priced SportsSenseAi market cards and edge snapshots.

`risk:{date}`
Stores latest bankroll sizing and exposure summary.

`autobet:{date}`
Stores generated auto-bet slips for the date.

`admin:health`
Stores the latest calibration and system health snapshot for the admin consoles.
