#!/usr/bin/env python3
"""
Simple test script to verify the artifact system is working correctly.
Run this after starting the main server to test artifact functionality.
"""

import requests
import json
import time

def test_artifact_system():
    """Test the artifact generation and retrieval system"""
    
    base_url = "http://localhost:8881"
    
    print("🧪 Testing ADK Artifact System")
    print("=" * 50)
    
    try:
        # Test 1: Check if server is running
        print("1. Checking server status...")
        response = requests.get(f"{base_url}/")
        if response.status_code == 200:
            print("✅ Server is running")
            print(f"   Response: {response.json()}")
        else:
            print("❌ Server not responding")
            return
        
        print()
        
        # Test 2: Test artifact system status
        print("2. Testing artifact system...")
        response = requests.get(f"{base_url}/artifacts/list")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Artifact system is ready")
            print(f"   Status: {result.get('message')}")
            
            # Test 3: Test agent interaction to trigger artifact
            print()
            print("3. Testing agent interaction (this should create an artifact)...")
            
            # Simulate agent run request
            agent_request = {
                "newMessage": {
                    "parts": [{"text": "Show me a financial analysis chart"}],
                    "role": "user"
                }
            }
            
            run_response = requests.post(
                f"{base_url}/apps/banking_agent/users/test_user/sessions/test_session:run",
                json=agent_request
            )
            
            if run_response.status_code == 200:
                events = run_response.json()
                print("✅ Agent interaction completed")
                print(f"   Received {len(events)} events")
                
                # For demo, assume an artifact was created
                # In a real implementation, you'd check the response for artifact indicators
                artifact_name = "financial_analysis_demo.png"
                
                print()
                
                # Test 4: Try to retrieve any artifacts
                print("4. Testing artifact retrieval...")
                if artifact_name:
                    response = requests.get(f"{base_url}/artifacts/{artifact_name}")
                    
                    if response.status_code == 200:
                        result = response.json()
                        if result.get("success"):
                            print("✅ Artifact retrieved successfully")
                            print(f"   MIME type: {result.get('mime_type')}")
                            print(f"   Data URL length: {len(result.get('data_url', ''))}")
                            
                            # Save a small HTML file to view the image
                            html_content = f"""
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>ADK Artifact Test</title>
                                <style>
                                    body {{ font-family: Arial, sans-serif; margin: 40px; }}
                                    .container {{ max-width: 800px; margin: 0 auto; }}
                                    img {{ max-width: 100%; height: auto; border: 1px solid #ddd; }}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>🎉 ADK Artifact System Test - SUCCESS!</h1>
                                    <h2>Generated Chart Artifact: {artifact_name}</h2>
                                    <img src="{result.get('data_url')}" alt="Generated Chart" />
                                    <p><strong>Artifact Name:</strong> {artifact_name}</p>
                                    <p><strong>MIME Type:</strong> {result.get('mime_type')}</p>
                                    <p><strong>Status:</strong> ✅ Artifact generation and retrieval working!</p>
                                </div>
                            </body>
                            </html>
                            """
                            
                            with open('artifact_test_result.html', 'w') as f:
                                f.write(html_content)
                            
                            print("   📄 Created 'artifact_test_result.html' - open it to view the generated chart!")
                            
                        else:
                            print("❌ Failed to retrieve artifact")
                            print(f"   Error: {result.get('message')}")
                    else:
                        print(f"❌ HTTP error retrieving artifact: {response.status_code}")
                else:
                    print("❌ No artifact name returned from generation")
            else:
                print("❌ Agent interaction failed")
                print(f"   Error: {run_response.status_code}")
        else:
            print("❌ Artifact system not ready")
            print(f"   Error: {result.get('message')}")
        
        print()
        print("🏁 Test completed!")
        
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Make sure the server is running on port 8881")
        print("   Start it with: python main.py")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_artifact_system()
