# QA 0.1.3 (isolated Obsidian, synthetic vault)

- PASS F5-version: plugin version in Obsidian: 0.1.3
- PASS F5-settings-change: data.json after changes: {"language":"en","letterFolder":"Letters QA","excludedFolders":["Private","Journal"],"autoWeekly":true,"weekday":3,"hour":8,"ai":{"provider":"local","cli":"claude","local":"lmstudio","localUrl":"http://localhost:1234/v1","api":"openai","apiUrl":"","apiKey":"","model":"","approvedSlot":"","timeoutSec":90,"maxContextChars":6000}}
- PASS F5-settings-persist: settings after reloading the plugin: {"language":"en","letterFolder":"Letters QA","excludedFolders":["Private","Journal"],"autoWeekly":true,"weekday":3,"hour":8,"ai":{"provider":"local","cli":"claude","local":"lmstudio","localUrl":"http://localhost:1234/v1","api":"openai","apiUrl":"","apiKey":"","model":"","approvedSlot":"","timeoutSec":90,"maxContextChars":6000}}
- PASS F5-check-connection: status line: Not connected · Unavailable
- PASS F5-approve-modal: modal text: Mind LetterOptionsGeneralAppearanceInterfaceEditorFiles and linksHotkeysKeychainCore pluginsCommunity pluginsCore pluginsBacklinksCanvasCommand paletteDaily not
- PASS F5-approve: approvedSlot: local:lmstudio:http://localhost:1234/v1
- PASS F5-revoke: approvedSlot after Revoke: ""
- PASS F5-save-error-notice: notices: ["LM Studio is not connected (Not connected · Unavailable)","Mind Letter: the setting could not be saved (disk full (simulated))"]; unhandled rejections: []
- PASS F5-command: command wrote into the configured folder: true
