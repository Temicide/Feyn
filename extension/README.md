# Feyn bridge for U-Bot

U-Bot has no MCP client or connector setting. Its web app exposes chat, code, transcription, media, and history endpoints only. This Chrome extension lets U-Bot call Feyn's MCP tools anyway. U-Bot asks for a tool in a JSON message, the extension calls Feyn's `/mcp` endpoint on this computer, and the result goes back into the chat.

## Install

1. Run Feyn locally so `http://127.0.0.1:4173/mcp` answers.
2. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose this `extension` folder.
3. Open [u.bot](https://u.bot) and start a new chat. A **Feyn bridge** panel appears at the bottom right and reports how many tools Feyn offers.

## Use

1. Select **Connect Feyn**. The panel sends U-Bot the live tool list and the reply format.
2. Ask U-Bot something that needs Feyn data, for example "Use a Feyn tool to see which concept the class should review before the next lesson."
3. When U-Bot replies with a `tool_call`, the panel shows **Run get_class_recap**. Select it to send the result.

The panel never runs a tool or sends a message without a click.

## What reaches U-Bot

Every tool result is sent to U-Bot's servers. `get_class_recap` contains per-concept counts and no learner names. `get_assignment` contains the lesson. `list_attempts` and `get_teacher_evidence` contain student transcripts, so use them only with data you are allowed to share. Results longer than 12,000 characters are truncated and marked `truncated`.

Feyn accepts `chrome-extension://` origins on `/mcp` only. The app API still rejects them.

## Limits

U-Bot follows the protocol by instruction, not by a native tool interface. It can ignore the format or describe a tool call instead of emitting one. The bridge depends on U-Bot's current page structure: the `Ask U-Bot` text area, the `ubot-send` button, and `ubot-assistant` replies. A U-Bot redesign can break it.
