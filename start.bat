@echo off
REM Set environment variables if needed
REM set PI_MCP_API_KEY=sk-ant-...
REM set PI_MCP_PROVIDER=anthropic
REM set PI_MCP_MODEL=claude-sonnet-4-20250514

REM Get the directory of this script
SET SCRIPT_DIR=%~dp0

REM Start the server with the correct path
node "%SCRIPT_DIR%dist\index.js"
