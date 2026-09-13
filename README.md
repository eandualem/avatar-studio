# Avatar Studio

A voice assistant with a body. A 3D robot character, generated and built
by agents, that you talk to in the browser: the OpenAI Realtime API for
speech, [TalkingHead](https://github.com/met4citizen/talkinghead) for
real-time lip-sync, and [assistant-runtime](https://github.com/eandualem/assistant-runtime)
behind it. A sibling of [Design Studio](https://github.com/eandualem/design-studio),
same stack, same discipline: one screen, no accounts, small on purpose.

**Status (2026-09-13):** milestone 1, the character. An agent on
[agent-backbone](https://github.com/eandualem/agent-backbone) is building
the robot in `references/` inside Blender. Nothing else exists yet.

## Pipeline

1. **Character** — hard-surface model built by code in Blender, rendered to
   match the reference sheet. *(now)*
2. **Rig** — body rig (Mixamo or Rigify), ARKit 52 + Oculus viseme blend
   shapes on the face.
3. **Export** — GLB with the rig and shapes TalkingHead expects.
4. **App** — Next.js + XState, full-screen avatar, mic button, transcript.
   The visitor's OpenAI key stays in the browser; the runtime never sees it.
5. **Voice** — gpt-realtime over WebRTC, audio-driven visemes.

## Working with Blender from a terminal

`scripts/bl` talks to Blender over the socket the
[MCP for Blender](https://github.com/ahujasid/blender-mcp) addon opens, so any
agent runtime, or a person, drives Blender with plain commands:

```bash
scripts/blender-up.sh                  # start Blender with the bridge
scripts/bl run blender/robot/build.py  # run code inside Blender
scripts/bl shot .tmp/view.png          # look at the viewport
scripts/bl render renders/front.png --engine CYCLES
```

The MCP server itself is optional; adapters for Claude Code (`.mcp.json`)
and Codex (`.codex/config.toml`) are included.

## License

MIT.
