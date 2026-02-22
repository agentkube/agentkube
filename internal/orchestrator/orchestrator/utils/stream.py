import json
from typing import List, Dict, Any, AsyncGenerator, Optional
from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, set_default_openai_api, set_tracing_export_api_key, OpenAIChatCompletionsModel
from agents import trace, gen_trace_id
from config import get_openrouter_api_key, get_openrouter_api_url, get_openai_api_key

from orchestrator.core.prompt.base_prompt import get_default_system_prompt, format_message_with_files

from orchestrator.tools.kubectl import kubectl_tools, set_kubecontext
from orchestrator.tools.helm import helm_tools
from orchestrator.tools.filesystem import filesystem_tools
from orchestrator.tools.terminal import terminal_tools

from orchestrator.services.conversation.conversation import ConversationService

from orchestrator.db.db import SessionLocal
from orchestrator.db.models.chat import ChatMessage
from orchestrator.db.models.stream import MessageStreamStatus

async def stream_agent_conversation(
    message: str,
    chat_history: Optional[List[ChatMessage]] = None,
    model_name: str = "openai/gpt-4o-mini",
    kubecontext: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    files: Optional[List[Dict[str, str]]] = None,
    conversation_id: Optional[str] = None,
    model: Optional[str] = None,
    prompt: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """
    Stream a response from the Kubernetes assistant using the OpenAI Agents SDK.
    """
    # Get a database session
    db = SessionLocal()
    
    try:
        # Create or get conversation
        if conversation_id:
            conversation = ConversationService.get_conversation(db, conversation_id)
            if not conversation:
                # Create a new conversation if ID doesn't exist
                conversation = ConversationService.create_conversation(db)
                conversation_id = conversation.id
        else:
            # Create a new conversation
            conversation = ConversationService.create_conversation(db)
            conversation_id = conversation.id
        
        # Log the user message to the database
        ConversationService.add_message(
            db=db, 
            conversation_id=conversation_id,
            role="user",
            content=message,
            kubecontext=kubecontext
        )

        custom_client = AsyncOpenAI(base_url=get_openrouter_api_url(), api_key=get_openrouter_api_key())
        set_default_openai_client(custom_client)
        set_default_openai_api("chat_completions")
        set_tracing_export_api_key(api_key=get_openai_api_key())
        
        trace_id = gen_trace_id()
        system_prompt = custom_prompt or get_default_system_prompt(kubecontext)
        
        # Buffer to collect the final AI response
        ai_response_buffer = ""
        
        # Use tracing for the entire agent execution
        with trace(workflow_name="Kubernetes Assistant", trace_id=trace_id):
            try:
                set_kubecontext(kubecontext)
                agent = Agent(
                    name="Kubernetes Assistant",
                    instructions=system_prompt,
                    model=OpenAIChatCompletionsModel(  
                        model=model_name,  
                        openai_client=AsyncOpenAI(
                            base_url=get_openrouter_api_url(), 
                            api_key=get_openrouter_api_key()
                        )  
                    ),
                    tools=kubectl_tools + helm_tools + filesystem_tools + terminal_tools
                )
                
                # Format the user message with files if any
                formatted_message = format_message_with_files(message, files)
                
                # Prepare input from chat history
                input_messages = []
                if chat_history:
                    for msg in chat_history:
                        input_messages.append({
                            "role": msg.role,
                            "content": msg.content
                        })
                
                # Add the current user message
                if input_messages:
                    input_messages.append({"role": "user", "content": formatted_message})
                    agent_input = input_messages
                else:
                    # If no history, just use the formatted message
                    agent_input = formatted_message
                
                # Run the agent with streaming enabled
                result = Runner.run_streamed(agent, input=agent_input, max_turns=20)
                
                # Send the trace ID to the client
                yield json.dumps({'trace_id': trace_id})
                     
                # Stream the results
                async for event in result.stream_events():
                    try:
                        # Process raw text deltas for streaming
                        if event.type == "raw_response_event":
                            if hasattr(event.data, "delta") and event.data.delta and hasattr(event.data, "type") and event.data.type == "response.output_text.delta":
                                ai_response_buffer += event.data.delta
                                yield json.dumps({'text': event.data.delta})
                                
                        # Process run items (higher-level events)
                        elif event.type == "run_item_stream_event":
                            if event.item.type == "tool_call_item":
                                if hasattr(event.item, "raw_item") and hasattr(event.item.raw_item, "name"):
                                    call_id = getattr(event.item.raw_item, "call_id", "")
                                    tool_data = {
                                        "tool": event.item.raw_item.name,
                                        "command": event.item.raw_item.arguments,
                                        "name": event.item.raw_item.name,
                                        "arguments": event.item.raw_item.arguments,
                                        "call_id":  call_id
                                    }
                                    yield json.dumps({'tool_call': tool_data})
                                    
                            elif event.item.type == "tool_call_output_item":
                                if hasattr(event.item, "output"):
                                    tool_output_data = {
                                        "call_id": event.item.raw_item.get("call_id", ""),
                                        "output": event.item.output
                                    }
                                    yield json.dumps({'tool_output': tool_output_data})
                                    
                            elif event.item.type == "message_output_item":
                                if hasattr(event.item, "content") and event.item.content:
                                    ai_response_buffer += event.item.content
                                    yield json.dumps({'text': event.item.content})
                            
                    except Exception as e:
                        error_msg = f"Error processing event: {str(e)}"
                        print(f"ERROR: {error_msg}")
                        ai_response_buffer += error_msg
                        yield json.dumps({'error': error_msg})
                
                # Signal that the streaming is complete
                yield json.dumps({'done': True})
                yield MessageStreamStatus.done.value
                
            except Exception as e:
                error_msg = f"Error in agent execution: {str(e)}"
                print(f"ERROR: {error_msg}")
                ai_response_buffer += error_msg
                yield json.dumps({'error': error_msg})
                yield json.dumps({'done': True})
                yield MessageStreamStatus.done.value

        # Log the assistant's response to the database
        ConversationService.add_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=ai_response_buffer,
            name="Kubernetes Assistant",
            model=model or model_name,
            prompt=prompt or custom_prompt,
            kubecontext=kubecontext
        )
                 
    except Exception as e:
        # Log any unexpected errors
        print(f"Error in stream_agent_conversation: {str(e)}")
        yield json.dumps({'error': f"An unexpected error occurred: {str(e)}"})
    finally:
        # Close the database session
        db.close()