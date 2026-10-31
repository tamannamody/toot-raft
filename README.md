# Toot Raft

Four pigs on a spinning raft, one spiky river, and nothing but toots to steer with.

## Play

Open `index.html` in any browser (Safari, Chrome, phone). No install, no server.

## Controls

- **1 2 3 4** or tap a pig: that pig toots and pushes the raft away from its side
- **Same pig 3 times fast:** ROCKET TOOT
- **Arrow keys / WASD, or tap the water:** push the raft that way (the best-aimed pig toots)
- **P / Esc:** pause

## Modes

- **Rivers 1 to 3:** Lazy Creek, Spiky Bends, Gas Gauntlet
- **Daily river:** a new course every day
- **Wardrobe:** lifetime beans unlock hats and outfits per pig

## Note

The fart sounds are clips from third-party YouTube Shorts and are for personal use. Replace them before any public release.

## Publish to stratos.games

The site is the repo `Stratos-Technologies-fzco/stratos-games-site`: one folder per maker, push and it is live about a minute later. This game's box is `games/tamannamody/`.

The box gets three files:

- `index.html`: this game **with the YouTube fart clips removed** (`window.SFX_DATA = null;`), so the built-in synth toots play instead
- `game.json`: copy from this repo
- `thumbnail.png`: the 800 by 500 cover, copy from this repo

Never touch another maker's folder, never run `tools/build.py`, commit only `games/tamannamody/`, pull with rebase before pushing.
