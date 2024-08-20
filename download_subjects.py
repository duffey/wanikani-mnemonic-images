import requests
import json
import os

# Read the WaniKani API token from the environment
api_token = os.getenv('WANIKANI_API_TOKEN')

if not api_token:
    raise ValueError("WANIKANI_API_TOKEN environment variable is not set")

# Initial URL for the subjects endpoint
url = "https://api.wanikani.com/v2/subjects"

# Headers including the API token
headers = {
    "Authorization": f"Bearer {api_token}"
}

# Container to hold all subjects
all_subjects = []

while url:
    # Make the request to the WaniKani API
    response = requests.get(url, headers=headers)
    
    # Check if the request was successful
    if response.status_code != 200:
        print(f"Failed to fetch data: {response.status_code}")
        break

    # Parse the JSON response
    data = response.json()

    # Append the subjects to the list
    all_subjects.extend(data['data'])

    # Get the next URL from the pagination information
    url = data['pages']['next_url']

# Save all subjects to subjects.json
with open('subjects.json', 'w') as f:
    json.dump(all_subjects, f, indent=2)

print(f"Fetched {len(all_subjects)} subjects and saved to subjects.json")

