import requests
import os

url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
output_path = "pose_landmarker.task"

if not os.path.exists(output_path):
    print(f"Downloading model from {url}...")
    response = requests.get(url)
    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        print("Model downloaded successfully.")
    else:
        print(f"Failed to download model. Status code: {response.status_code}")
else:
    print("Model already exists.")
