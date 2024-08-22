import OpenAI from 'openai';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/');
		const type = pathParts[1];  // 'meaning' or 'reading'
		const id = parseInt(pathParts[2], 10);  // Subject ID
		const key = `${id.toString().padStart(5, '0')}_${type}.png`;

		if (request.method === 'POST') {
			return await handlePostRequest(request, env, key, type, id);
		} else if (request.method === 'OPTIONS') {
			return handleOptionsRequest();
		} else {
			return new Response('Method Not Allowed', {
				status: 405,
			});
		}
	},
};

// Function to handle POST requests for a single meaning or reading
async function handlePostRequest(request, env, key, type, id) {
	const bucket = env.R2;  // Retrieve the R2 bucket from the environment
	const imageUrl = `https://wanikani-mnemonic-images.com/${key}`;

	// Check if the image already exists in R2
	try {
		const object = await bucket.get(key);
		if (object) {
			return new Response(JSON.stringify({ message: `Image ${key} already exists in R2.`, url: imageUrl }), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': 'https://www.wanikani.com',
				},
			});
		}
	} catch (err) {
		// If the object doesn't exist, the error status should be 404, so we continue to generate it
		if (err.status !== 404) {
			return new Response(JSON.stringify({ error: 'Error checking R2 bucket.' }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': 'https://www.wanikani.com',
				},
			});
		}
	}

	// Retrieve the OpenAI API key from environment variables
	const openai_api_key = env.OPENAI_API_KEY;
	if (!openai_api_key) {
		return new Response(JSON.stringify({ error: 'OpenAI API key is not configured.' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': 'https://www.wanikani.com',
			},
		});
	}

	// Initialize the OpenAI client
	const client = new OpenAI({
		apiKey: openai_api_key,
	});

	// Load subjects.json from R2
	const subjects = await loadSubjects(bucket);
	const prompt = getSubjectPrompt(subjects, id, type);

	if (!prompt) {
		return new Response(JSON.stringify({ error: `No ${type} mnemonic found for subject ID ${id}.` }), {
			status: 404,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': 'https://www.wanikani.com',
			},
		});
	}

	// Generate the image using OpenAI API
	const imageData = await generateImage(prompt, client);

	// Upload the image to R2
	await bucket.put(key, imageData);

	return new Response(JSON.stringify({ message: `Image ${key} generated and uploaded to R2.`, url: imageUrl }), {
		status: 201,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': 'https://www.wanikani.com',
		},
	});
}

// Function to handle OPTIONS requests
function handleOptionsRequest() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': 'https://www.wanikani.com',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}

// Function to load subjects.json from the R2 bucket
async function loadSubjects(bucket) {
	const object = await bucket.get('subjects.json');
	if (!object) {
		throw new Error('subjects.json not found in the R2 bucket.');
	}

	const subjectsText = await object.text();
	return JSON.parse(subjectsText);
}

// Function to get the prompt from subjects.json based on subject ID and type
function getSubjectPrompt(subjects, subjectId, type) {
	const subject = subjects.find((s) => s.id === subjectId);
	if (!subject) return null;

	return type === 'meaning'
		? subject.data.meaning_mnemonic
		: subject.data.reading_mnemonic;
}

// Function to generate the image using OpenAI's API
async function generateImage(prompt, client) {
	const response = await client.images.generate({
		model: 'dall-e-3',
		prompt: prompt,
		size: '1024x1024',
		n: 1,
	});

	const imageUrl = response.data[0].url;
	const imageData = await fetch(imageUrl).then((res) => res.arrayBuffer());

	return imageData;
}

