import asyncio
import websockets

async def test_connect():
    uri = "ws://127.0.0.1:8000/ws/pose"
    try:
        async with websockets.connect(uri) as websocket:
            print("Successfully connected!")
            await websocket.send("data:image/jpeg,base64,test")
            print("Sent test data")
            response = await websocket.recv()
            print(f"Received: {response}")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(test_connect())
