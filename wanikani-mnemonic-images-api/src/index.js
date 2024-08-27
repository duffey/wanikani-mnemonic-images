import OpenAI from 'openai';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/');
		const type = pathParts[1]; // 'meaning' or 'reading'
		const id = parseInt(pathParts[2], 10); // Subject ID
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
	const bucket = env.R2; // Retrieve the R2 bucket from the environment
	const imageUrl = `https://assets.wanikani-mnemonic-images.com/${key}`;

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

	// Load subject data from KV store
	const subjectData = await env.SUBJECTS.get(id.toString());
	if (!subjectData) {
		return new Response(JSON.stringify({ error: `Subject data not found for ID ${id}.` }), {
			status: 404,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': 'https://www.wanikani.com',
			},
		});
	}

	// Parse the subject data and get the prompt
	const subjects = JSON.parse(subjectData);
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

// Function to get the prompt from subjects.json based on subject ID and type
function getSubjectPrompt(subject, subjectId, type) {
	// Using the subject data directly as we are fetching specific subject from KV
	if (type === 'meaning') {
		let prompt = subject.data.meaning_mnemonic;
		if (subject.data.meaning_hint) {
			prompt += `\n\n${subject.data.meaning_hint}`;
		}
		return prompt;
	} else {
		let prompt = subject.data.reading_mnemonic;
		if (subject.data.reading_hint) {
			prompt += `\n\n${subject.data.reading_hint}`;
		}
		return prompt;
	}
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
