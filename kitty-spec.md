Specification: OpenCode Kitty-Native Display Driver1. AbstractThis document specifies the architecture for a "Kitty-Native" display driver for OpenCode. The project will be implemented as a hard fork of oh-my-opencode-slim, replacing its default tmux/TUI logic with a fluid, GPU-accelerated interface that leverages the native capabilities of the Kitty terminal emulator.Core Philosophy:Foundation: Built on oh-my-opencode-slim (The Pantheon Architecture: Orchestrator, Explorer, Oracle, Librarian, Designer, Fixer).Frontend (UI): Managed exclusively by Kitty. Handles window splitting, layouts, rendering, and graphics.Backend (State): Managed by tmux (headless). Handles process persistence, history, and recovery.2. Requirements2.1 User EnvironmentTerminal: Kitty (v0.26.0+ recommended).Shell Utilities: tmux (v3.0+), sh/bash.Configuration: User must have allow_remote_control socket-only (or yes) enabled in kitty.conf.2.2 Functional GoalsSeamless Integration: The user runs opencode directly in their terminal. No special wrapper scripts or pre-launch configuration is required.Pantheon Tiling: The "Orchestrator" (Main) runs in the primary window. Sub-agents (Fixer, Explorer, Oracle) appear in automatically arranged tiles using Kitty's Tall or Fat layouts.Graphics Support: Agents can render images/plots directly to the GPU using the Kitty Graphics Protocol, bypassing tmux's rendering limitations.Session Persistence: If the terminal window is closed, the agent processes continue running in the background (via tmux) and can be re-attached.3. Architecture3.1 The Stackgraph TD
    User[User Terminal (Kitty)]
    Fork[Fork: oh-my-opencode-slim]
    Socket[Kitty Remote Control Socket]
    
    subgraph "Visual Layer (Kitty)"
        OrchWin[Main Window: 01. Orchestrator]
        ExpWin[Agent Window: 02. Explorer]
        FixWin[Agent Window: 06. Fixer]
    end

    subgraph "Persistence Layer (Headless Tmux)"
        Session1[Tmux: oc-slim-orchestrator]
        Session2[Tmux: oc-slim-explorer]
        Session3[Tmux: oc-slim-fixer]
    end

    User --> OrchWin
    OrchWin --> Fork
    Fork --"kitten @ launch"--> Socket
    Socket --Creates--> ExpWin
    Socket --Creates--> FixWin
    
    ExpWin --"Wraps"--> Session2
    FixWin --"Wraps"--> Session3
4. Implementation Details4.1 Integration with oh-my-opencode-slimWe will modify the slim codebase to intercept agent spawning events in the Orchestrator's delegation logic.Target Module: src/agents/orchestrator.ts (Delegation Logic) and src/services/terminal/tmux.ts.Agent Mapping: We map the "Pantheon" roles to specific window configurations.01. Orchestrator: Primary window (User Input).02. Explorer: "Read-Only" Blue tint.03. Oracle: "Planning" Purple tint.04. Librarian: "Research" Green tint.05. Designer: "Visual" Pink tint.06. Fixer: "Builder" Orange tint.4.2 Session Identification & NamingTo map visual Kitty windows to headless tmux sessions, we use a strict naming convention based on the slim role definitions.Session ID: oc-{project}-{role} (e.g., oc-proj1-fixer)Window Title: Pantheon: {Role Name}4.3 The "Delegation" Operation (Spawning a Pantheon Member)When the Orchestrator decides to delegate a task (e.g., "Fixer, implement this interface"), the plugin executes:Check Persistence: Does a tmux session named oc-proj1-fixer already exist?Construct Command:If New: tmux new-session -A -s oc-proj1-fixer 'opencode run-agent --role fixer'If Existing: tmux new-session -A -s oc-proj1-fixer (Attaches to existing context)Execute via Kitty RPC:The plugin sends a payload to the Kitty socket to launch this command in a new visual window.kitten @ launch \
  --type=window \
  --location=split \
  --cwd=current \
  --title="Pantheon: Fixer" \
  --keep-focus \
  tmux new-session -A -s oc-proj1-fixer 'opencode run-agent --role fixer'
4.4 The "Control" Operation (Driving the Agent)The Orchestrator often needs to send instructions to a specialized agent.Strategy A (Visual Injection): If the user is watching, we want them to see the text appear.Command: kitten @ send-text --match title:"Pantheon: Fixer" "IMPLEMENT: auth_service.ts\r"Pros: "Ghost in the machine" effect; user sees the prompt injection.Strategy B (Backend Injection - Fallback):Command: tmux send-keys -t oc-proj1-fixer "IMPLEMENT: auth_service.ts" EnterPros: Reliable background delegation.4.5 Graphics HandlingMechanism: When Designer (Role 05) or Explorer (Role 02) needs to show visual data (e.g., a component preview or a file dependency graph):Agent script outputs base64-encoded image data wrapped in Kitty escape codes.Tmux (running inside the pane) passes this through via set -g allow-passthrough on.Kitty renders the image overlay.5. Configuration Requirements5.1 Plugin Configuration (opencode.json)The user enables this mode by setting the display driver in their project config:{
  "display_driver": "kitty-native",
  "pantheon_layout": "tall" // Options: tall, fat, grid
}
5.2 Kitty Configuration (kitty.conf)The plugin should validate these settings on startup:# Mandatory for RPC
allow_remote_control socket-only
listen_on unix:/tmp/mykitty

# Recommended for Layouts
enabled_layouts splits,stack,tall,fat
5.3 Tmux Configuration (Internal)The plugin should generate a temporary tmux.conf or pass arguments to ensure compatibility:tmux -f /dev/null new-session ... \
  -c "set -g status off" \          # Hide tmux status bar (Kitty handles UI)
  -c "set -g allow-passthrough on"  # Allow images to pass through
6. Edge Cases & Recovery6.1 "I closed the window by accident"Event: User closes the "Fixer" window in Kitty.Result: The Kitty window dies. The tmux client inside it dies. The tmux server keeps the session alive.Recovery: The Orchestrator detects the window is missing (via kitten @ ls) but the session is alive. It re-spawns the window attached to the same session seamlessly.6.2 "Focus Mode"Action: User presses Kitty's "Zoom" shortcut (Ctrl+Shift+Z).Result: The current agent (e.g., Oracle planning a migration) takes up the full window. Other agents continue running in the background, managed by tmux.
