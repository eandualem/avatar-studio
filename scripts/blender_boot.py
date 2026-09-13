"""Runs inside Blender at launch (scripts/blender-up.sh passes it via --python).

Enables the "MCP for Blender" addon for this session. Its register() auto-starts
the socket server on port 9876, which scripts/bl and any MCP client talk to.
Nothing is written to user preferences, so a plain Blender launch is unaffected.
"""
import bpy

MODULE = "blender_mcp"  # installed by `uvx blender-mcp install-addon`

try:
    bpy.ops.preferences.addon_enable(module=MODULE)
    print(f"[avatar-studio] addon {MODULE} enabled; bridge on port "
          f"{getattr(bpy.context.scene, 'blendermcp_port', 9876)}")
except Exception as exc:  # noqa: BLE001
    print(f"[avatar-studio] could not enable {MODULE}: {exc}. "
          "Run `uvx blender-mcp install-addon` and relaunch.")
