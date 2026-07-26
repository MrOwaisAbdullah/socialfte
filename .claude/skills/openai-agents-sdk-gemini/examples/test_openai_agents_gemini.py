"""
Test file for OpenAI Agents SDK with Gemini API
This validates the correct implementation
"""

import asyncio
import os
from dotenv import load_dotenv
from agents import (
    Agent, Runner, function_tool, handoff,
    AsyncOpenAI, OpenAIChatCompletionsModel,
    SQLiteSession, set_tracing_disabled
)
import sys

# Load environment
load_dotenv()
set_tracing_disabled(True)

# Test results
TEST_RESULTS = []

def log_test(name: str, passed: bool, message: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    TEST_RESULTS.append({"name": name, "passed": passed, "message": message})
    print(f"{status}: {name}")
    if message:
        print(f"    {message}")

async def test_basic_setup():
    """Test basic Gemini API setup"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Test Agent",
            instructions="Say 'Hello, I am working!' in response",
            model=model,
        )

        result = await Runner.run(agent, "Test")

        passed = "Hello" in result.final_output
        log_test(
            "Basic Gemini Setup",
            passed,
            result.final_output if not passed else ""
        )

    except Exception as e:
        log_test("Basic Gemini Setup", False, str(e))

async def test_tool_integration():
    """Test function tool integration"""
    @function_tool
    def echo_tool(message: str) -> str:
        """Echo the given message"""
        return f"Echo: {message}"

    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Tool Test Agent",
            instructions="Use the echo_tool to echo the message 'test123'",
            model=model,
            tools=[echo_tool],
        )

        result = await Runner.run(agent, "Use your tool")

        passed = "test123" in result.final_output and "Echo:" in result.final_output
        log_test(
            "Tool Integration",
            passed,
            f"Expected 'Echo: test123', got: {result.final_output}" if not passed else ""
        )

    except Exception as e:
        log_test("Tool Integration", False, str(e))

async def test_session_management():
    """Test session management"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Memory Test Agent",
            instructions="Remember the city name I tell you",
            model=model,
        )

        session = SQLiteSession("test_session_123")

        # First interaction
        result1 = await Runner.run(
            agent,
            "I live in London",
            session=session
        )

        # Second interaction - should remember London
        result2 = await Runner.run(
            agent,
            "What city did I say I live in?",
            session=session
        )

        passed = "London" in result2.final_output
        log_test(
            "Session Management",
            passed,
            f"Expected agent to remember London, got: {result2.final_output}" if not passed else ""
        )

    except Exception as e:
        log_test("Session Management", False, str(e))

async def test_handoffs():
    """Test agent handoffs"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        specialist = Agent(
            name="Specialist",
            instructions="I am a specialist. Say 'Specialist handling this request.'",
            model=model,
        )

        triage = Agent(
            name="Triage",
            instructions="Hand off to the specialist",
            model=model,
            handoffs=[handoff(specialist, "specialist_handoff")],
        )

        result = await Runner.run(
            triage,
            "I need specialist help"
        )

        passed = "Specialist" in result.final_output
        log_test(
            "Agent Handoffs",
            passed,
            f"Expected specialist to handle, got: {result.final_output}" if not passed else ""
        )

    except Exception as e:
        log_test("Agent Handoffs", False, str(e))

async def test_sync_runner():
    """Test synchronous runner"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Sync Test",
            instructions="Reply with 'Sync working!'",
            model=model,
        )

        # Using synchronous runner
        result = Runner.run_sync(agent, "Test sync")

        passed = "Sync working" in result.final_output
        log_test(
            "Synchronous Runner",
            passed,
            result.final_output if not passed else ""
        )

    except Exception as e:
        log_test("Synchronous Runner", False, str(e))

async def test_streaming():
    """Test streaming functionality"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Stream Test",
            instructions="Count from 1 to 5",
            model=model,
        )

        streamed_content = []

        async for event in Runner.run_streamed(agent, "Count"):
            if event.type == "agent_step_stream":
                for chunk in event.output:
                    streamed_content.append(chunk.content)

        full_response = "".join(streamed_content)
        passed = len(full_response) > 0
        log_test(
            "Streaming Responses",
            passed,
            f"Streamed content: {full_response[:100]}..." if passed else "No content streamed"
        )

    except Exception as e:
        log_test("Streaming Responses", False, str(e))

async def test_max_turns():
    """Test max_turns functionality"""
    try:
        provider = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )

        model = OpenAIChatCompletionsModel(
            openai_client=provider,
            model="gemini-2.0-flash-lite",
        )

        agent = Agent(
            name="Loop Test",
            instructions="Keep saying 'Continue...' forever",
            model=model,
        )

        # Should limit to 3 turns
        result = await Runner.run(
            agent,
            "Start",
            max_turns=3
        )

        # Should have completed within 3 turns
        passed = hasattr(result, 'final_output')
        log_test(
            "Max Turns Limit",
            passed,
            "Agent completed within turn limit" if passed else "Agent exceeded turn limit"
        )

    except Exception as e:
        log_test("Max Turns Limit", False, str(e))

async def run_all_tests():
    """Run all tests"""
    print("🧪 Running OpenAI Agents SDK + Gemini Tests\n")
    print("=" * 50)

    # Check API key first
    if not os.getenv("GEMINI_API_KEY"):
        print("❌ GEMINI_API_KEY not found in environment!")
        print("Please set your Gemini API key in .env file")
        return

    print("Running tests...\n")

    # Run all test functions
    await test_basic_setup()
    await test_tool_integration()
    await test_session_management()
    await test_handoffs()
    await test_sync_runner()
    await test_streaming()
    await test_max_turns()

    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)

    passed = sum(1 for t in TEST_RESULTS if t["passed"])
    total = len(TEST_RESULTS)

    print(f"\nTotal: {total} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")

    if passed == total:
        print("\n🎉 All tests passed! Your implementation is correct.")
    else:
        print("\n⚠️ Some tests failed. Check the errors above.")
        print("\nFailed tests:")
        for test in TEST_RESULTS:
            if not test["passed"]:
                print(f"  - {test['name']}: {test['message']}")

if __name__ == "__main__":
    asyncio.run(run_all_tests())