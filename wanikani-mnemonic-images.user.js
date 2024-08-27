// ==UserScript==
// @name         WaniKani Mnemonic Images
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Generate and display mnemonic images on WaniKani
// @author       Scott Duffey
// @match        https://*.wanikani.com/*
// @grant        GM_xmlhttpRequest
// @connect      wanikani-mnemonic-images.com
// ==/UserScript==

(function () {
	'use strict';

	let currentSubjectId = null;
	let previousSectionReading = null;
	let previousSectionMeaning = null;

	// Function to create an image element
	function createImageElement(src) {
		const img = document.createElement('img');
		img.src = src;
		img.style.width = '100%';
		img.style.height = 'auto';
		img.style.maxWidth = '500px';
		img.style.maxHeight = '500px';
		img.style.marginBottom = '30px';
		return img;
	}

	// Function to create a "Generate image..." button with a spinner
	function createGenerateButton(subjectId, sectionType) {
		const button = document.createElement('button');
		const buttonText = document.createElement('span');
		buttonText.innerText = `Generate ${sectionType} image...`;
		button.classList.add('wk-button', 'wk-button--default', 'generate-image-button');
		button.style.display = 'inline-block';
		button.style.marginBottom = '30px'; // Set bottom margin to 30px
		button.style.width = 'auto';
		button.style.cursor = 'pointer';

		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		spinner.style.marginLeft = '10px';
		spinner.style.display = 'none';
		spinner.innerHTML = `
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .spinner {
                    border: 2px solid rgba(0, 0, 0, 0.1);
                    border-left-color: rgb(85, 85, 85);
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                    animation: spin 1s linear infinite;
                }
            </style>`;

		button.appendChild(buttonText);
		button.appendChild(spinner);

		button.addEventListener('click', async () => {
			try {
				buttonText.innerText = `Generating ${sectionType} image...`;
				spinner.style.display = 'inline-block';
				button.disabled = true;
				button.style.cursor = 'not-allowed';

				const response = await generateImage(subjectId, sectionType);

				if (response.status === 201) {
					const paddedId = subjectId.toString().padStart(5, '0');
					const imageUrl = `https://assets.wanikani-mnemonic-images.com/${paddedId}_${sectionType}.png`;
					await waitForImage(imageUrl, button, spinner);

					const img = createImageElement(imageUrl);
					button.insertAdjacentElement('afterend', img);
					button.remove();
				} else {
					throw new Error('Failed to generate image.');
				}
			} catch (error) {
				alert('Failed to generate image.');
				buttonText.innerText = `Generate ${sectionType} image...`;
				spinner.style.display = 'none';
				button.disabled = false;
				button.style.cursor = 'pointer';
			}
		});

		return button;
	}

	// Helper function to insert an element
	function insertElement(element, isLessonPage, sectionContent, insertionPoint) {
		if (isLessonPage) {
			sectionContent.insertAdjacentElement('afterend', element); // Insert after the section for lessons
		} else if (insertionPoint) {
			insertionPoint.parentNode.insertBefore(element, insertionPoint); // Insert before the note section for reviews
		} else {
			sectionContent.appendChild(element); // Append to bottom if no specific location
		}
	}

	// Function to inject image or generate button for a given subject ID and section type (meaning or reading)
	function injectImageOrButton(subjectId, sectionType, sectionContent) {
		const paddedId = subjectId.toString().padStart(5, '0');
		const cacheBustedUrl = `https://assets.wanikani-mnemonic-images.com/${paddedId}_${sectionType}.png?_=${new Date().getTime()}`;

		// Determine if we are on a lessons page or a reviews page
		const isLessonPage = !sectionContent.querySelector('.user-note');

		// Define the insertion point based on page type
		const insertionPoint = sectionContent.querySelector('.user-note')?.parentElement;

		if (sectionContent.querySelector(`img[src^="https://assets.wanikani-mnemonic-images.com/${paddedId}_${sectionType}.png"]`)) {
			console.log(`Image already present for subject ID ${paddedId} (${sectionType}), skipping injection.`);
			return;
		}

		if (sectionContent.querySelector('.generate-image-button')) {
			console.log(`Generate image button already present for subject ID ${paddedId} (${sectionType}), skipping injection.`);
			return;
		}

		GM_xmlhttpRequest({
			method: 'HEAD',
			url: cacheBustedUrl,
			onload: function (response) {
				if (response.status === 200) {
					const img = createImageElement(cacheBustedUrl);
					insertElement(img, isLessonPage, sectionContent, insertionPoint);
					console.log(`Image successfully loaded for subject ID ${paddedId} (${sectionType})`);
				} else if (response.status === 404) {
					const button = createGenerateButton(subjectId, sectionType);
					insertElement(button, isLessonPage, sectionContent, insertionPoint);
					console.log(`Image not found for subject ID ${paddedId} (${sectionType}), adding generate button.`);
				} else {
					console.error(`Failed to load image for subject ID ${paddedId} (${sectionType}): ${response.status}`);
				}
			},
			onerror: function (error) {
				console.error(`Request error for subject ID ${paddedId} (${sectionType}):`, error);
			}
		});
	}

	// Function to observe the body for changes and update relevant sections for lessons and reviews
	function observeSections() {
		const observer = new MutationObserver(() => {
			const sectionReading = document.querySelector('#reading > div > div > section:nth-child(1)') || document.getElementById('section-reading'); // Reading section
			const sectionMeaning = document.querySelector('#meaning > div > div > section:nth-child(1)') || document.getElementById('section-meaning'); // Meaning section
			const subjectIdElement = document.querySelector('label[for="user-response"][data-subject-id]');
			const subjectMeta = document.querySelector('meta[name="subject_id"]');
			const turboFrame = document.querySelector('turbo-frame[src*="subject_id="]'); // Look for turbo-frame with subject_id

			let newSubjectId = null;
			if (subjectIdElement) {
				newSubjectId = parseInt(subjectIdElement.getAttribute('data-subject-id'));
			} else if (subjectMeta) {
				newSubjectId = parseInt(subjectMeta.getAttribute('content'));
			} else if (turboFrame) {
				const src = turboFrame.getAttribute('src');
				const match = src.match(/subject_id=(\d+)/);
				if (match) {
					newSubjectId = parseInt(match[1]);
				}
			}

			if (newSubjectId && newSubjectId !== currentSubjectId) {
				currentSubjectId = newSubjectId;
				console.log(`New subject loaded. Subject ID: ${currentSubjectId}`);
			}

			if (sectionReading && (!previousSectionReading || !sectionReading.isEqualNode(previousSectionReading))) {
				previousSectionReading = sectionReading;
				injectImageOrButton(currentSubjectId, 'reading', sectionReading);
			}

			if (sectionMeaning && (!previousSectionMeaning || !sectionMeaning.isEqualNode(previousSectionMeaning))) {
				previousSectionMeaning = sectionMeaning;
				injectImageOrButton(currentSubjectId, 'meaning', sectionMeaning);
			}
		});

		observer.observe(document.body, { childList: true, subtree: true });
	}

	// Function to call the worker API to generate an image
	async function generateImage(subjectId, sectionType) {
		const url = `https://api.wanikani-mnemonic-images.com/${sectionType}/${subjectId}`;
		return await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	// Function to wait until an image is available using GM_xmlhttpRequest to avoid CORS issues
	async function waitForImage(imageUrl, button, spinner) {
		let attempts = 0;
		while (attempts < 30) {
			const cacheBustedUrl = `${imageUrl}?_=${new Date().getTime()}`;
			const success = await new Promise((resolve) => {
				GM_xmlhttpRequest({
					method: 'HEAD',
					url: cacheBustedUrl,
					onload: function (response) {
						if (response.status === 200) {
							resolve(true);
						} else {
							resolve(false);
						}
					},
					onerror: function () {
						resolve(false);
					}
				});
			});

			if (success) {
				return;
			}

			await new Promise(resolve => setTimeout(resolve, 1000));
			attempts++;
		}

		throw new Error('Image did not become available in time.');
	}

	// Initialize the script by observing the body for changes
	observeSections();
})();
