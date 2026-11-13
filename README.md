# Toot Raft

One pig on a spinning raft, one spiky river, and nothing but toots to steer with.

## Play

Open `index.html` in any browser (Safari, Chrome, phone). No install, no server.

## Controls

- **Arrow keys / WASD, the arrow buttons, or tap the water:** your pig runs round the raft edge to the far side, then toots, pushing the raft that way
- **Tap your pig, its name button, or Space:** toot on the spot
- **3 toots fast from the same spot:** ROCKET TOOT
- **Your name:** type it on the home screen (or in the Wardrobe); it rides above your pig
- **P / Esc:** pause · **R:** restart

## Modes

- **Rivers 1 to 3:** Lazy Creek, Spiky Bends, Gas Gauntlet
- **Rivers 4 to 6 (3D build):** Whirlpool Bay, Mine Sweep, The Big Stink. Each opens when the river before it is finished and you hold enough stars in total (5, 8, 11)
- **Checkpoint (3D build, solo):** pop after the halfway mark and you can continue from there once per river, with full hearts. The clock keeps running, and a continued run scores no heart points and cannot earn the No hits star. It goes through `offerReward()`, which is free for now and will show a rewarded ad once Stratos ads are live
- **Daily river:** a new course every day. Finishing it on days in a row builds a streak that pays bonus beans (5 per streak day, up to 25)
- **Stars (3D build):** up to 3 per river: finish, lose no hearts, beat par. The best is saved and shown on the menu
- **Wardrobe:** lifetime beans unlock hats and outfits for your pig
- **Play with friends (3D build):** tap Play with friends, send the link, up to 4 players share the raft, each with their own pig (blue, red, yellow, teal). Names and wardrobe looks travel to everyone; names show in the player list and over each pig. The host picks the river. Friends who open the link land straight on the raft.

## How online play works

The host's game runs the river and sends the raft and every pig's spot to everyone 30 times a second; friends send their pushes and toots back. Browsers connect directly (WebRTC, through the PeerJS library bundled into the file). The free PeerJS server at 0.peerjs.com only introduces the browsers, and PeerJS's free relay helps when a network blocks a direct link. Solo play never uses the network. If the PeerJS server is down, online play shows "Could not reach the online server" and solo still works.

## Note

The fart sounds are clips from third-party YouTube Shorts and are for personal use. Replace them before any public release.

## Publish to stratos.games

The site is the repo `Stratos-Technologies-fzco/stratos-games-site`: one folder per maker, push and it is live about a minute later. This game's box is `games/tamannamody/`.

The box gets three files:

- `index.html`: this game **with the YouTube fart clips removed** (`window.SFX_DATA = null;`), so the built-in synth toots play instead
- `game.json`: copy from this repo
- `thumbnail.png`: the 800 by 500 cover, copy from this repo

Never touch another maker's folder, never run `tools/build.py`, commit only `games/tamannamody/`, pull with rebase before pushing.

## 3D version

`3d/index.html` is the 3D build: one file, no install, no outside scripts, and no YouTube clips (the built-in toots play). It has a chase camera and a water slide in the sky, with the same rules, rivers, daily river, wardrobe and saved progress as the 2D game.

To change it, edit `3d/src/`, then run `npm install` and `npm run build` inside `3d/`. `3d/index.html` is written by that build, so do not edit it by hand.

To publish it, copy `3d/index.html` and `3d/thumbnail.png` into the box, along with `game.json`.
