import json

# Read subjects.json, create key-value pairs, and save to subjects_kv.json
kv_pairs = [
    {"key": str(subject['id']), "value": json.dumps(subject)}
    for subject in json.load(open('subjects.json', 'r', encoding='utf-8'))
]

with open('subjects_kv.json', 'w', encoding='utf-8') as output_file:
    json.dump(kv_pairs, output_file, separators=(',', ':'))

print("Key-value pairs have been written to subjects_kv.json")
