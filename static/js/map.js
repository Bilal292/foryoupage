window.openRandomPinPopup = false;
window.randomPinId = null;
window.isGoingToRandomPin = false;

let selectedCoordinates = null;
let mapClickHandler = null;
let pinModal = null;
let isPopupOpen = false;
let justClosedPopup = false; 

// Get CSRF token for Django
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
const csrftoken = getCookie('csrftoken');

// Initialize map
var map = L.map('map', {
    minZoom: 4,
    maxZoom: 18,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0
}).setView([50, 0], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Create a marker cluster group
var markers = L.markerClusterGroup({
    chunkedLoading: true,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
});
map.addLayer(markers);

// Track the currently open popup and map movement
var currentPopup = null;
var isAdjustingForPopup = false;
var userInteracted = false;
var isOpeningPopup = false; // Flag to track if we're opening a popup

// Customising the pin pop up
function createPopupContent(pin) {
    // Determine platform classes
    let platformClass = 'default';
    let buttonClass = 'default';
    let platformName = pin.platform || 'Unknown Platform';
    
    if (pin.platform) {
        const platformLower = pin.platform.toLowerCase();
        if (platformLower === 'youtube shorts') {
            platformClass = 'youtube';
            buttonClass = 'youtube';
        } else if (platformLower === 'tiktok') {
            platformClass = 'tiktok';
            buttonClass = 'tiktok';
        }
    }
    
    // Format date
    const createdDate = new Date(pin.created_at);
    const formattedDate = createdDate.toLocaleDateString() + ' ' + 
                          createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Get the URL from platform_data
    const url = pin.platform_data?.url || '';
    
    // Generate embed HTML for supported platforms
    let embedHtml = '';
    
    if (pin.platform && pin.platform.toLowerCase() === 'youtube shorts' && url) {
        // Extract video ID from any YouTube URL format
        let youtubeId = null;
        
        // Try standard watch URL
        if (!youtubeId) {
            const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i);
            if (match) youtubeId = match[1];
        }
        
        // Try shorts URL
        if (!youtubeId) {
            const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^/?&]+)/i);
            if (match) youtubeId = match[1];
        }
        
        // Try short URL
        if (!youtubeId) {
            const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^/?&]+)/i);
            if (match) youtubeId = match[1];
        }
        
        // Try embed URL
        if (!youtubeId) {
            const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^/?&]+)/i);
            if (match) youtubeId = match[1];
        }
        
        if (youtubeId) {
            embedHtml = `
                <div class="embed-container youtube-embed">
                    <iframe 
                        src="https://www.youtube.com/embed/${youtubeId}" 
                        width="100%" 
                        height="400" 
                        style="border:none;"
                        allowfullscreen
                        onload="this.style.display='block'"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                    </iframe>
                    <div class="embed-fallback" style="display: none;">
                        <div class="embed-fallback-message">
                            <i class="fab fa-youtube"></i>
                            <p>Unable to embed this YouTube video</p>
                            <p>Click the "Open Link" button below to view on YouTube</p>
                        </div>
                    </div>
                </div>
            `;
        }
    } 
    else if (pin.platform && pin.platform.toLowerCase() === 'tiktok' && url) {
        const videoId = pin.platform_data?.video_id || '';

        if (videoId) {
            embedHtml = `
                <blockquote 
                    class="tiktok-embed" 
                    cite="${url}" 
                    data-video-id="${videoId}" 
                    style="max-width: 605px; min-width: 325px;">
                    <section>
                        <a href="${url}" target="_blank">View on TikTok</a>
                    </section>
                </blockquote>
            `;
        } else {
            embedHtml = `<div class="popup-link">${url}</div>`;
        }
    }
    else if (pin.platform && pin.platform.toLowerCase() === 'instagram' && url) {
        const shortcode = pin.platform_data?.shortcode || '';

        if (shortcode) {
            embedHtml = `
                <blockquote 
                    class="instagram-media" 
                    data-instgrm-permalink="${url}" 
                    data-instgrm-version="14"
                    style="max-width: 605px; min-width: 325px; min-height: 570px;">
                </blockquote>
            `;
        } else {
            embedHtml = `<div class="popup-link">${url}</div>`;
        }
    }
    
    // If no embed available, show the link
    if (!embedHtml && url) {
        embedHtml = `<div class="popup-link">${url}</div>`;
    }

    return `
        <div class="custom-popup">
            <div class="popup-content">
                ${embedHtml}
            </div>
            <div class="popup-actions">
            </div>
        </div>
    `;
}

L.Popup.prototype._closeIfOutOfView = function() {
    // Override the default behavior to prevent popup from closing automatically on smaller screens
    return;
};

// Store pin data in markers to identify them later
function createMarkerWithPin(pin) {
    let marker = L.marker([pin.latitude, pin.longitude]);
    
    // Ensure pin data has the correct structure
    const pinData = {
        ...pin,
        platform_data: pin.platform_data || {
            url: pin.url || '',
            video_id: pin.video_id || ''
        }
    };
    
    marker.pinData = pinData; // Store pin data for later identification
    marker.bindPopup(createPopupContent(pinData), {
        maxWidth: 350,
        className: 'custom-popup-container',
        autoClose: false,  
        closeButton: false 
    });
    return marker;
}

function isPointVisible(lat, lng) {
    const bounds = map.getBounds();
    return bounds.contains([lat, lng]);
}

function isPinInCluster(pinId) {
    // Check if the pin is in a cluster by looking for it in the markers
    let pinFound = false;
    let isClustered = true;
    
    markers.eachLayer(layer => {
        if (layer.pinData && layer.pinData.id === pinId) {
            pinFound = true;
            // Check if the marker is visible (not in a cluster)
            if (layer._icon && layer._icon.style.display !== 'none') {
                isClustered = false;
            }
        }
    });
    
    // If pin not found, it might be in a cluster that hasn't been expanded yet
    if (!pinFound) {
        return true;
    }
    
    return isClustered;
}

function zoomToPin(pinId, maxZoom = 18) {
    return new Promise((resolve, reject) => {
        // Check if we've reached max zoom
        if (map.getZoom() >= maxZoom) {
            reject(new Error("Reached maximum zoom level"));
            return;
        }
        
        // Check if the pin is still in a cluster
        if (isPinInCluster(pinId)) {
            // Zoom in one level
            map.zoomIn(1, {
                animate: true,
                duration: 0.5
            });
            
            // Wait for the zoom to complete, then check again
            setTimeout(() => {
                zoomToPin(pinId, maxZoom)
                    .then(resolve)
                    .catch(() => {
                        // If we can't zoom further, try to find the pin and open it
                        markers.eachLayer(layer => {
                            if (layer.pinData && layer.pinData.id === pinId) {
                                layer.openPopup();
                            }
                        });
                        resolve();
                    });
            }, 600);
        } else {
            // Pin is visible, find it and open the popup
            markers.eachLayer(layer => {
                if (layer.pinData && layer.pinData.id === pinId) {
                    layer.openPopup();
                }
            });
            resolve();
        }
    });
}

// Load pins from the server
function loadPins() {
    // Check if there's an open popup and remember its pin data
    let openPopupPin = null;
    if (currentPopup && currentPopup.isOpen()) {
        const sourceMarker = currentPopup._source;
        if (sourceMarker && sourceMarker.pinData) {
            openPopupPin = sourceMarker.pinData;
        }
    }

    let bounds = map.getBounds();
    let sw = bounds.getSouthWest();
    let ne = bounds.getNorthEast();

    fetch(`/api/pins/in_bounds/?sw_lat=${sw.lat}&sw_lng=${sw.lng}&ne_lat=${ne.lat}&ne_lng=${ne.lng}`)
        .then(res => res.json())
        .then(pins => {
            // Clear existing markers
            markers.clearLayers();
            
            // Add new markers to the cluster group
            pins.forEach(pin => {
                const marker = createMarkerWithPin(pin);
                markers.addLayer(marker);

                // Only reopen the popup if:
                // 1. This marker corresponds to the open popup pin
                // 2. AND the map movement was not initiated by the user (userInteracted is false)
                if (openPopupPin && pin.id === openPopupPin.id && !userInteracted) {
                    marker.openPopup();
                }
            });
            
            // If we have a random pin ID, check if it's in the loaded pins
            if (window.randomPinId) {
                const randomPin = pins.find(pin => pin.id === window.randomPinId);
            }
        });
}

// Handle popup events
map.on('popupopen', function(e) {
    currentPopup = e.popup;
    isAdjustingForPopup = true;
    isOpeningPopup = true;
    userInteracted = false;
    isPopupOpen = true;
    justClosedPopup = false; // Reset the flag when a popup opens

    // Hide the search bar when popup opens
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.classList.add('hidden');
    }

    // Show the close button
    const popupCloseBtn = document.getElementById('popupCloseBtn');
    if (popupCloseBtn) {
        popupCloseBtn.style.display = 'flex';
    }

    // Wait a moment for DOM to settle
    setTimeout(() => {
        const popupElement = e.popup.getElement();
        if (popupElement) {
            // Look for TikTok embeds inside the popup
            const tiktokEmbeds = popupElement.querySelectorAll('.tiktok-embed');
            if (tiktokEmbeds.length > 0) {
                // If TikTok script has already loaded, force it to re-render
                if (window.tiktokEmbed && typeof window.tiktokEmbed.render === 'function') {
                    window.tiktokEmbed.render();
                } else {
                    // If not yet loaded, load it now
                    const script = document.createElement('script');
                    script.src = "https://www.tiktok.com/embed.js";
                    script.async = true;
                    script.onload = function() {
                        if (window.tiktokEmbed && typeof window.tiktokEmbed.render === 'function') {
                            window.tiktokEmbed.render();
                        }
                    };
                    document.body.appendChild(script);
                }
            }
            
            // Look for Instagram embeds inside the popup
            const instagramEmbeds = popupElement.querySelectorAll('.instagram-media');
            if (instagramEmbeds.length > 0) {
                // If Instagram script has already loaded, force it to re-render
                if (window.instgrm && typeof window.instgrm.Embeds.process === 'function') {
                    window.instgrm.Embeds.process();
                } else {
                    // If not yet loaded, load it now
                    const script = document.createElement('script');
                    script.src = "https://www.instagram.com/embed.js";
                    script.async = true;
                    script.onload = function() {
                        if (window.instgrm && typeof window.instgrm.Embeds.process === 'function') {
                            window.instgrm.Embeds.process();
                        }
                    };
                    document.body.appendChild(script);
                }
            }
        }
    }, 300);

    // Prevent clicks inside the popup from closing it
    setTimeout(function() {
        const popupElement = e.popup.getElement();
        if (popupElement) {
            const popupContent = popupElement.querySelector('.leaflet-popup-content');
            if (popupContent) {
                popupContent.addEventListener('click', function(event) {
                    event.stopPropagation();
                });
            }
        }
    }, 10);
});

map.on('popupclose', function(e) {
    if (currentPopup === e.popup) {
        currentPopup = null;
    }
    isPopupOpen = false;
    justClosedPopup = true; // Set the flag when a popup closes
    
    // Show the search bar when popup closes
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.classList.remove('hidden');
    }
    
    // Hide the close button
    const popupCloseBtn = document.getElementById('popupCloseBtn');
    if (popupCloseBtn) {
        popupCloseBtn.style.display = 'none';
    }
    
    // Reset the flag after a short delay
    setTimeout(() => {
        justClosedPopup = false;
    }, 300);
});

// Handle map events
map.on('movestart', function() {
    userInteracted = true;
});

map.on('moveend', function() {
    // If the map moved due to popup opening, don't close the popup
    if (isAdjustingForPopup) {
        isAdjustingForPopup = false;
        return;
    }
    
    // If we're going to a random pin, don't close the popup
    if (window.isGoingToRandomPin) {
        window.isGoingToRandomPin = false;
        return;
    }
    
    // If we're opening a popup, don't close it
    if (isOpeningPopup) {
        isOpeningPopup = false;
        return;
    }
    
    // If the user manually moved the map, close any open popup
    if (userInteracted && currentPopup && currentPopup.isOpen()) {
        currentPopup.close();
        currentPopup = null;
    }
    
    // Always reload pins when the map moves
    loadPins();
});

// Reset form function
function resetForm() {
    document.getElementById("linkInput").value = "";
    const pinForm = document.getElementById("pinForm");
    if (pinForm) pinForm.classList.remove('was-validated');
    
    // Reset location options
    const selectedLocationOption = document.getElementById('selectedLocationOption');
    const randomLocationOption = document.getElementById('randomLocationOption');
    const currentLocationOption = document.getElementById('currentLocationOption');
    
    if (selectedLocationOption) selectedLocationOption.checked = false;
    if (randomLocationOption) randomLocationOption.checked = false;
    if (currentLocationOption) currentLocationOption.checked = false;
}

function openPinModal() {
    // Reset form
    resetForm();
    
    // Set location options based on how the modal was opened
    if (selectedCoordinates) {
        // Modal opened by map click
        const selectedLocationOption = document.getElementById('selectedLocationOption');
        const selectedLocationInfo = document.getElementById('selectedLocationInfo');
        
        if (selectedLocationOption) selectedLocationOption.checked = true;
        if (selectedLocationInfo) {
            selectedLocationInfo.textContent = 
                `Selected: ${selectedCoordinates.lat.toFixed(4)}, ${selectedCoordinates.lng.toFixed(4)}`;
            selectedLocationInfo.style.display = 'block';
        }
    } else {
        // Modal opened by FAB button
        const randomLocationOption = document.getElementById('randomLocationOption');
        const selectedLocationInfo = document.getElementById('selectedLocationInfo');
        
        if (randomLocationOption) randomLocationOption.checked = true;
        if (selectedLocationInfo) selectedLocationInfo.style.display = 'none';
    }
    
    // Show the modal
    if (pinModal) {
        pinModal.show();
    }
}

// Add click event listener to the map
map.on('click', function(e) {
    // If we just closed a popup, don't open the modal
    if (justClosedPopup) {
        justClosedPopup = false; // Reset the flag
        return;
    }
    
    // If a popup is currently open, close it
    if (isPopupOpen && currentPopup && currentPopup.isOpen()) {
        currentPopup.close();
        return;
    }
    
    // Otherwise, proceed with opening the modal
    const { lat, lng } = e.latlng;
    selectedCoordinates = { lat, lng };
    
    // Open the modal with selected coordinates
    openPinModal();
});

// Initial load
map.whenReady(loadPins);

// UI functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap modal
    pinModal = new bootstrap.Modal(document.getElementById('pinModal'));

    // Random pin button functionality
    const randomPinBtn = document.getElementById("randomPinBtn");
    
    // UI elements
    const openFormBtn = document.getElementById("openFormBtn");
    const toastEl = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // Popup close button functionality
    const popupCloseBtn = document.getElementById('popupCloseBtn');
    if (popupCloseBtn) {
        popupCloseBtn.addEventListener('click', function() {
            if (currentPopup && currentPopup.isOpen()) {
                currentPopup.close();
            }
        });
    }

    randomPinBtn.addEventListener("click", function() {
        // Hide the search bar when loading random pin
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.add('hidden');
        }
        
        // Show loading indicator
        randomPinBtn.disabled = true;
        randomPinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        fetch("/api/pins/random/")
            .then(res => {
                if (!res.ok) {
                    throw new Error("Network response was not ok");
                }
                return res.json();
            })
            .then(pin => {
                if (pin.error) {
                    showToast(`❌ ${pin.error}`, "error");
                    randomPinBtn.disabled = false;
                    randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
                    
                    // Show the search bar again if there was an error
                    if (searchContainer) {
                        searchContainer.classList.remove('hidden');
                    }
                    return;
                }
                
                // Store the random pin ID
                window.randomPinId = pin.id;
                window.isGoingToRandomPin = true;
                
                // First, pan to the pin's location at a reasonable zoom level
                map.setView([pin.latitude, pin.longitude], 10, {
                    animate: true,
                    duration: 1.5
                });
                
                // After panning, start the zoom-in process
                setTimeout(() => {
                    // Load pins for the new area
                    loadPins();
                    
                    // Wait a bit for pins to load, then start zooming
                    setTimeout(() => {
                        zoomToPin(pin.id)
                            .then(() => {
                                // Success! Reset button
                                randomPinBtn.disabled = false;
                                randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
                                
                                // The search bar will be hidden by the popupopen event handler
                            })
                            .catch(error => {
                                console.error("Error zooming to pin:", error);
                                showToast("⚠️ Could not zoom to pin", "warning");
                                randomPinBtn.disabled = false;
                                randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
                                
                                // Show the search bar again if there was an error
                                if (searchContainer) {
                                    searchContainer.classList.remove('hidden');
                                }
                            });
                    }, 1000);
                }, 1600);
            })
            .catch(error => {
                showToast("❌ Error fetching random pin", "error");
                randomPinBtn.disabled = false;
                randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
                
                // Show the search bar again if there was an error
                if (searchContainer) {
                    searchContainer.classList.remove('hidden');
                }
            });
    });

    // Open modal when FAB is clicked
    openFormBtn.addEventListener('click', () => {
        selectedCoordinates = null; // Clear any previously selected coordinates
        
        // Hide the search bar when modal opens
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.add('hidden');
        }
        
        openPinModal();
    });
    
    // Reset form when modal is hidden
    document.getElementById('pinModal').addEventListener('hidden.bs.modal', () => {
        resetForm();
        
        // Show the search bar when modal closes
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.remove('hidden');
        }
    });
    
    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toastEl.className = 'toast';
        
        // Set background color based on type
        if (type === 'success') {
            toastEl.classList.add('text-bg-success');
        } else if (type === 'error') {
            toastEl.classList.add('text-bg-danger');
        } else {
            toastEl.classList.add('text-bg-primary');
        }
        
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }

    function getClientLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not supported by this browser."));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }),
                error => reject(error),
                { timeout: 5000 }
            );
        });
    }
    
    // Form submission
    document.getElementById("pinForm").addEventListener("submit", async function(e) {
        e.preventDefault(); // Prevent form submission
        
        const linkInput = document.getElementById("linkInput");
        
        // Validate form
        if (!linkInput.value) {
            linkInput.classList.add('is-invalid');
            return;
        }
        
        linkInput.classList.remove('is-invalid');
        
        // Determine location type
        const locationType = document.querySelector('input[name="locationOption"]:checked');
        if (!locationType) {
            showToast("❌ Please select a location option", "error");
            return;
        }
        
        let requestData = {
            link: linkInput.value,
            location_type: locationType.value
        };
        
        if (locationType.value === "selected" && selectedCoordinates) {
            requestData.latitude = selectedCoordinates.lat;
            requestData.longitude = selectedCoordinates.lng;
        } else if (locationType.value === "current") {
            try {
                const position = await getClientLocation();
                requestData.latitude = position.latitude;
                requestData.longitude = position.longitude;
            } catch (error) {
                showToast("❌ Could not get your current location", "error");
                return;
            }
        }
        
        // Show loading state
        const postBtn = document.getElementById("postBtn");
        const originalBtnText = postBtn.innerHTML;
        postBtn.disabled = true;
        postBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Posting...';
        
        fetch("/api/pins/create/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken
            },
            body: JSON.stringify(requestData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                showToast("✅ Pin posted successfully!");
                if (pinModal) {
                    pinModal.hide();
                }
                resetForm();
                
                // Reload pins to include the new one
                loadPins();
                
                // Center map on new pin
                map.panTo([data.latitude, data.longitude], {
                    animate: true,
                    duration: 1
                });
            } else {
                showToast(`❌ ${data.error || "Error posting pin"}`, "error");
            }
        })
        .catch(error => {
            showToast("❌ Network error. Please try again.", "error");
        })
        .finally(() => {
            // Reset button state
            postBtn.disabled = false;
            postBtn.innerHTML = originalBtnText;
        });
    });
});

// Search functionality
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

let debounceTimer;

// Function to fetch search results from Photon API
function fetchSearchResults(query) {
    if (!query) {
        searchResults.style.display = 'none';
        return;
    }

    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            displaySearchResults(data.features);
        })
        .catch(error => {
            console.error('Error fetching search results:', error);
            // Show error message in search results
            searchResults.innerHTML = `
                <div class="search-result-item">
                    Error fetching results. Please try again.
                </div>
            `;
            searchResults.style.display = 'block';
        });
}

// Function to display search results
function displaySearchResults(features) {
    searchResults.innerHTML = '';

    if (features.length === 0) {
        searchResults.innerHTML = `
            <div class="search-result-item">
                No locations found. Try a different search.
            </div>
        `;
        searchResults.style.display = 'block';
        return;
    }

    features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        // Format the display name using properties
        const properties = feature.properties;
        let name = properties.name || '';
        if (properties.city) name += `, ${properties.city}`;
        if (properties.country) name += `, ${properties.country}`;

        item.textContent = name;

        item.addEventListener('click', () => {
            // Get the coordinates and pan the map
            const [lon, lat] = feature.geometry.coordinates;
            map.setView([lat, lon], 13, {
                animate: true,
                duration: 1
            });

            // Hide the search results
            searchResults.style.display = 'none';
            searchInput.value = name;
        });

        searchResults.appendChild(item);
    });

    searchResults.style.display = 'block';
}

// Event listener for search input with debounce
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();

    debounceTimer = setTimeout(() => {
        fetchSearchResults(query);
    }, 300); // 300ms debounce
});

// Hide search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar')) {
        searchResults.style.display = 'none';
    }
});

// Prevent search results from closing when clicking inside them
searchResults.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Add a clear button to the search input
function addClearButton() {
    const searchContainer = document.querySelector('.search-bar');
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'search-clear';
    clearButton.innerHTML = '&times;';
    clearButton.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #666;
        display: none;
        z-index: 2;
        transition: color 0.2s ease;
    `;
    
    // Add hover effect
    clearButton.addEventListener('mouseenter', function() {
        this.style.color = '#333';
    });
    
    clearButton.addEventListener('mouseleave', function() {
        this.style.color = '#666';
    });
    
    searchContainer.appendChild(clearButton);
    
    // Function to update clear button visibility
    function updateClearButtonVisibility() {
        clearButton.style.display = searchInput.value ? 'block' : 'none';
    }
    
    // Show/hide clear button based on input
    searchInput.addEventListener('input', updateClearButtonVisibility);
    
    // Clear input when button is clicked
    clearButton.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent form submission if inside a form
        searchInput.value = '';
        searchResults.style.display = 'none';
        searchInput.focus(); // Return focus to the input field
        updateClearButtonVisibility(); // Immediately hide the clear button
    });
    
    // Initialize visibility
    updateClearButtonVisibility();
}

// Initialize clear button
addClearButton();
