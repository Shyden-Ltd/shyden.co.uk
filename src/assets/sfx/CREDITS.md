# Sound effects — provenance and licence

All six files originate from **Kenney** (<https://kenney.nl>) and are released under
**Creative Commons Zero (CC0 1.0 Universal)** — public domain.
<http://creativecommons.org/publicdomain/zero/1.0/>

> "This content is free to use in personal, educational and commercial projects.
> Support us by crediting Kenney or www.kenney.nl (this is not mandatory)"
> — `LICENSE.txt`, Kenney _Interface Sounds_ 1.0, dated 11-02-2020

Attribution is not required. We credit Kenney here anyway.

## What was taken, and what was done to it

Downloaded from the _Interface Sounds_ pack. Each file was trimmed of trailing silence
(below -60 dBFS of its own peak, keeping a 15ms tail so nothing clicks), gain-staged, and
encoded to AAC at 96 kbps mono. Nothing was pitched, filtered, or re-synthesised.

| Ships as      | Kenney original    | Length | Peak after mastering |
| ------------- | ------------------ | ------ | -------------------- |
| `shuffle.m4a` | `scratch_001.wav`  | 138ms  | -8.6 dBFS            |
| `land-1.m4a`  | `select_004.wav`   | 250ms  | -2.0 dBFS            |
| `land-2.m4a`  | `select_005.wav`   | 252ms  | -3.1 dBFS            |
| `land-3.m4a`  | `select_006.wav`   | 268ms  | -5.6 dBFS            |
| `land-4.m4a`  | `select_003.wav`   | 250ms  | -2.5 dBFS            |
| `done.m4a`    | `maximize_006.wav` | 387ms  | -4.8 dBFS            |

The four `land-*` files are matched by **RMS**, not by peak. Peak-matching would leave the
darkest of them (`select_006`, the lowest-brightness sound in the pack) audibly quieter than
the others, so one landing in every cycle of four would duck. Matching loudness instead is why
their gains differ (0.576 to 0.863) while their peaks do not line up.
