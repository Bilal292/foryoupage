// ===== GLOBAL VARIABLES =====
window.openRandomPinPopup = false;
window.randomPinId = null;
window.isGoingToRandomPin = false;

let selectedCoordinates = null;
let mapClickHandler = null;
let pinModal = null;
let isPopupOpen = false;
let justClosedPopup = false; 
let currentPopup = null;
let isAdjustingForPopup = false;
let userInteracted = false;
let isOpeningPopup = false;

// ===== MAP AND MARKER VARIABLES =====
let map = null;
let markers = null;
let csrftoken = null;

// ===== ZOOM LEVEL CONTROL =====
const MIN_ZOOM_LEVEL_FOR_PINS = 4; // Minimum zoom level to load pins
let zoomLevelIndicator = null; // Will hold the indicator element

// ===== UTILITY FUNCTIONS =====
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

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
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

// ===== MAP INITIALIZATION =====
function initializeMap() {
    // Initialize map
    map = L.map('map', {
        minZoom: 2, // Allow zooming all the way out
        maxZoom: 18,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0
    }).setView([50, 0], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Create a marker cluster group
    markers = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });
    map.addLayer(markers);
    
    // Set up event listeners
    setupMapEventListeners();
    
    // Initialize zoom level indicator
    initializeZoomLevelIndicator();
    
    // Check initial zoom level
    updateZoomLevelIndicator();
}

// ===== MAP EVENT LISTENERS =====
function setupMapEventListeners() {
    // Map events
    map.on('popupopen', handlePopupOpen);
    map.on('popupclose', handlePopupClose);
    map.on('movestart', handleMapMoveStart);
    map.on('moveend', handleMapMoveEnd);
    map.on('click', handleMapClick);
}

// ===== MAP EVENT HANDLERS =====
function handlePopupOpen(e) {
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

    // Handle embeds
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

            // Look for Reddit embeds inside the popup
            const redditEmbeds = popupElement.querySelectorAll('.reddit-card');
            if (redditEmbeds.length > 0) {
                // Check if Reddit embed script is already loaded
                if (window.redditEmbed) {
                    // If already loaded, process the embeds
                    window.redditEmbed.render();
                } else {
                    // Load the Reddit embed script
                    const script = document.createElement('script');
                    script.src = "https://embed.redditmedia.com/widgets/platform.js";
                    script.async = true;
                    script.charset = "UTF-8";
                    script.onload = function() {
                        // After script loads, process the embeds
                        if (window.redditEmbed && typeof window.redditEmbed.render === 'function') {
                            window.redditEmbed.render();
                        }
                    };
                    document.head.appendChild(script);
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
}

function handlePopupClose(e) {
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
}

function handleMapMoveStart() {
    userInteracted = true;
}

function handleMapMoveEnd() {
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
    
    // Update zoom level indicator
    updateZoomLevelIndicator();
    
    // Only load pins if zoom level is sufficient
    if (map.getZoom() >= MIN_ZOOM_LEVEL_FOR_PINS) {
        loadPins();
    }
}
function handleMapClick(e) {
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
}

// ===== MARKER AND PIN FUNCTIONS =====
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
        } else if (platformLower === 'instagram') {
            platformClass = 'instagram';
            buttonClass = 'instagram';
        } else if (platformLower === 'reddit') {
            platformClass = 'reddit';
            buttonClass = 'reddit';
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
    else if (pin.platform && pin.platform.toLowerCase() === 'reddit' && url) {
        const postId = pin.platform_data?.post_id || '';

        if (postId) {
            embedHtml = `
                <blockquote class="reddit-card" style="min-height:  480px;">
                    <a href="${url}">View this Reddit post</a>
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

function loadPins() {
    // Check if map is initialized
    if (!map || !markers) {
        console.error("Map or markers not initialized");
        return;
    }
    
    // Check if zoom level is sufficient
    if (map.getZoom() < MIN_ZOOM_LEVEL_FOR_PINS) {
        return; // Don't load pins if zoom level is too low
    }

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
        })
        .catch(error => {
            console.error("Error loading pins:", error);
        });
}

// ===== MODAL FUNCTIONS =====
function initializeModal() {
    // Initialize Bootstrap modal
    pinModal = new bootstrap.Modal(document.getElementById('pinModal'));
    
    // Set up event listeners
    document.getElementById('pinModal').addEventListener('hidden.bs.modal', () => {
        resetForm();
        
        // Show the search bar when modal closes
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.remove('hidden');
        }
    });
    
    // Form submission
    document.getElementById("pinForm").addEventListener("submit", handleFormSubmit);
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
    
    // Hide the search bar when modal opens
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.classList.add('hidden');
    }
    
    // Show the modal
    if (pinModal) {
        pinModal.show();
    }
}

async function handleFormSubmit(e) {
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
}

// ===== UI FUNCTIONS =====
function initializeUI() {
    // Random pin button functionality
    const randomPinBtn = document.getElementById("randomPinBtn");
    
    // UI elements
    const openFormBtn = document.getElementById("openFormBtn");

    // Popup close button functionality
    const popupCloseBtn = document.getElementById('popupCloseBtn');
    if (popupCloseBtn) {
        popupCloseBtn.addEventListener('click', function() {
            if (currentPopup && currentPopup.isOpen()) {
                currentPopup.close();
            }
        });
    }

    randomPinBtn.addEventListener("click", handleRandomPinClick);

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
    
    // Setup search functionality
    setupSearch();
}

function handleRandomPinClick() {
    // Hide the search bar when loading random pin
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.classList.add('hidden');
    }
    
    // Hide zoom level indicator
    if (zoomLevelIndicator) {
        zoomLevelIndicator.classList.add('hidden');
    }
    
    // Show loading indicator
    const randomPinBtn = document.getElementById("randomPinBtn");
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
}

// ===== SEARCH FUNCTIONS =====
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    let debounceTimer;

    // Event listener for search input with debounce
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        debounceTimer = setTimeout(() => {
            fetchSearchResults(query);
        }, 1000); // 1s debounce
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
    addClearButton();
}

function fetchSearchResults(query) {
    const searchResults = document.getElementById('searchResults');
    
    if (!query) {
        searchResults.style.display = 'none';
        return;
    }

    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`;

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

function displaySearchResults(features) {
    const searchResults = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');
    
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

function addClearButton() {
    const searchContainer = document.querySelector('.search-bar');
    const searchInput = document.getElementById('searchInput');
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
        document.getElementById('searchResults').style.display = 'none';
        searchInput.focus(); // Return focus to the input field
        updateClearButtonVisibility(); // Immediately hide the clear button
    });
    
    // Initialize visibility
    updateClearButtonVisibility();
}

// ===== ZOOM LEVEL INDICATOR FUNCTIONS =====
function initializeZoomLevelIndicator() {
    // Create the zoom level indicator element if it doesn't exist
    if (!zoomLevelIndicator) {
        zoomLevelIndicator = document.getElementById('zoomLevelIndicator');
        
        // Add zoom event listener
        map.on('zoomend', updateZoomLevelIndicator);
    }
}

function updateZoomLevelIndicator() {
    if (!map || !zoomLevelIndicator) return;
    
    const currentZoom = map.getZoom();
    
    if (currentZoom < MIN_ZOOM_LEVEL_FOR_PINS) {
        // Show indicator
        zoomLevelIndicator.classList.remove('hidden');
        
        // Calculate progress percentage
        const minZoom = map.getMinZoom();
        const maxZoom = MIN_ZOOM_LEVEL_FOR_PINS;
        const progress = ((currentZoom - minZoom) / (maxZoom - minZoom)) * 100;
        
        // Update progress bar
        const progressBar = zoomLevelIndicator.querySelector('.zoom-progress-bar');
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        
        // Clear existing markers if zoom level is too low
        if (markers) {
            markers.clearLayers();
        }
    } else {
        // Hide indicator and load pins
        zoomLevelIndicator.classList.add('hidden');
        loadPins();
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Get CSRF token
    csrftoken = getCookie('csrftoken');
    
    // Initialize components
    initializeMap();
    initializeModal();
    initializeUI();
});

// Override default popup behavior to prevent closing on smaller screens
L.Popup.prototype._closeIfOutOfView = function() {
    return;
};
