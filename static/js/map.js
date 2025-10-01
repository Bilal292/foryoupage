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

// Function to create custom popup content
function createPopupContent(pin) {
    // Determine platform classes
    let platformClass = 'default';
    let buttonClass = 'default';
    let platformName = 'Unknown Platform';
    
    if (pin.platform) {
        const platformLower = pin.platform.toLowerCase();
        if (platformLower === 'tiktok') {
            platformClass = 'tiktok';
            buttonClass = 'tiktok';
            platformName = 'TikTok';
        } else if (platformLower === 'youtube shorts') {
            platformClass = 'youtube';
            buttonClass = 'youtube';
            platformName = 'YouTube'; 
        } else if (platformLower === 'instagram reels') {
            platformClass = 'instagram';
            buttonClass = 'instagram';
            platformName = 'Instagram Reels';
        } else if (platformLower === 'x (twitter)') {
            platformClass = 'twitter';
            buttonClass = 'twitter';
            platformName = 'X (Twitter)';
        }
    }
    
    // Generate embed HTML for supported platforms
    let embedHtml = '';
    if (pin.platform) {
        const platformLower = pin.platform.toLowerCase();
        
        if (platformLower === 'tiktok') {
            // Extract video ID from any TikTok URL format
            // Handles: tiktok.com/@username/video/123456, tiktok.com/t/123456, tiktok.com/video/123456
            // Also handles: vm.tiktok.com/ZNdGAt2J4/
            let videoId = null;
            
            // Try standard format with numeric ID
            const standardMatch = pin.link.match(/tiktok\.com\/(?:@[^/]+\/)?(?:video\/|t\/)?(\d+)/);
            if (standardMatch) {
                videoId = standardMatch[1];
            } 
            // Try short URL format with alphanumeric code
            else {
                const shortMatch = pin.link.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/);
                if (shortMatch) {
                    videoId = shortMatch[1];
                }
            }
            
            if (videoId) {
                embedHtml = `
                    <div class="embed-container tiktok-embed">
                        <iframe 
                            src="https://www.tiktok.com/embed/v2/${videoId}" 
                            width="100%" 
                            height="400" 
                            style="border:none;"
                            allowfullscreen
                            onload="this.style.display='block'"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                        </iframe>
                        <div class="embed-fallback" style="display: none;">
                            <div class="embed-fallback-message">
                                <p>Click the "Open Link" button below to view on TikTok</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else if (platformLower === 'youtube shorts') {
            // Extract video ID from any YouTube URL format
            // Handles: youtube.com/watch?v=ID, youtube.com/shorts/ID, youtu.be/ID, youtube.com/embed/ID
            let youtubeId = null;
            
            // Try standard watch URL
            if (!youtubeId) {
                const match = pin.link.match(/youtube\.com\/watch\?v=([^&]+)/);
                if (match) youtubeId = match[1];
            }
            
            // Try shorts URL
            if (!youtubeId) {
                const match = pin.link.match(/youtube\.com\/shorts\/([^/?&]+)/);
                if (match) youtubeId = match[1];
            }
            
            // Try short URL (youtu.be)
            if (!youtubeId) {
                const match = pin.link.match(/youtu\.be\/([^/?&]+)/);
                if (match) youtubeId = match[1];
            }
            
            // Try embed URL
            if (!youtubeId) {
                const match = pin.link.match(/youtube\.com\/embed\/([^/?&]+)/);
                if (match) youtubeId = match[1];
            }
            
            if (youtubeId) {
                embedHtml = `
                    <div class="embed-container youtube-embed">
                        <iframe 
                            src="https://www.youtube.com/embed/${youtubeId}" 
                            width="100%" 
                            height="200" 
                            style="border:none;"
                            allowfullscreen
                            onload="this.style.display='block'"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                        </iframe>
                        <div class="embed-fallback" style="display: none;">
                            <div class="embed-fallback-message">
                                <p>Click the "Open Link" button below to view on YouTube</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else if (platformLower === 'instagram reels') {
            // Instagram Reels fallback message
            embedHtml = `
                <div class="embed-container instagram-embed">
                    <div class="embed-fallback">
                        <div class="embed-fallback-message">
                            <p>Click the "Open Link" button below to view on Instagram</p>
                        </div>
                    </div>
                </div>
            `;
        } else if (platformLower === 'x (twitter)') {
            // X (Twitter) fallback message
            embedHtml = `
                <div class="embed-container twitter-embed">
                    <div class="embed-fallback">
                        <div class="embed-fallback-message">
                            <p>Click the "Open Link" button below to view on X</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    // If no embed available, show the link
    if (!embedHtml) {
        embedHtml = `<div class="popup-link">${pin.link}</div>`;
    }
    
    return `
        <div class="custom-popup">
            <div class="popup-header">
                <div class="platform-badge ${platformClass}">${platformName}</div>
            </div>
            <div class="popup-content">
                ${embedHtml}
            </div>
            <div class="popup-actions">
                <a href="${pin.link}" target="_blank" class="popup-button ${buttonClass}">
                    <i class="fas fa-external-link-alt"></i> Open Link
                </a>
            </div>
        </div>
    `;
}

// Store pin data in markers to identify them later
function createMarkerWithPin(pin) {
    let marker = L.marker([pin.latitude, pin.longitude]);
    marker.pinData = pin; // Store pin data for later identification
    marker.bindPopup(createPopupContent(pin), {
        maxWidth: 300,
        className: 'custom-popup-container',
        autoClose: false,  
        closeButton: true 
    });
    return marker;
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
        });
}

// Handle popup events
map.on('popupopen', function(e) {
    currentPopup = e.popup;
    isAdjustingForPopup = true;
    userInteracted = false;
    
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
    
    // If the user manually moved the map, close any open popup
    if (userInteracted && currentPopup && currentPopup.isOpen()) {
        currentPopup.close();
        currentPopup = null;
    }
    
    // Always reload pins when the map moves
    loadPins();
});

// Initial load
map.whenReady(loadPins);

// UI functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap modal
    const pinModal = new bootstrap.Modal(document.getElementById('pinModal'));
    const agreementModal = new bootstrap.Modal(document.getElementById('agreementModal'));
    
    // UI elements
    const openFormBtn = document.getElementById("openFormBtn");
    const pinForm = document.getElementById("pinForm");
    const titleSection = document.getElementById("titleSection");
    const toastEl = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const agreementCheck = document.getElementById('agreementCheck');
    const agreeAndContinueBtn = document.getElementById('agreeAndContinueBtn');

    // Track if user has already agreed in this session
    let hasAgreedThisSession = sessionStorage.getItem('hasAgreedToTerms') === 'true';

    // Open modal when FAB is clicked
    openFormBtn.addEventListener('click', () => {
        if (hasAgreedThisSession) {
            // If already agreed in this session, show pin modal directly
            pinModal.show();
        } else {
            // Otherwise, show agreement modal first
            agreementModal.show();
        }
    });

    // Enable/disable "Agree and Continue" button based on checkbox
    agreementCheck.addEventListener('change', function() {
        agreeAndContinueBtn.disabled = !this.checked;
    });

    
    // Handle "Agree and Continue" button click
    agreeAndContinueBtn.addEventListener('click', function() {
        if (agreementCheck.checked) {
            // Remember agreement for this session
            sessionStorage.setItem('hasAgreedToTerms', 'true');
            hasAgreedThisSession = true;
            
            // Hide agreement modal and show pin modal
            agreementModal.hide();
            pinModal.show();
        }
    });
    
    // Reset form when modal is hidden
    document.getElementById('pinModal').addEventListener('hidden.bs.modal', () => {
        resetForm();
    });

    // Reset agreement check when agreement modal is hidden
    document.getElementById('agreementModal').addEventListener('hidden.bs.modal', () => {
        agreementCheck.checked = false;
        agreeAndContinueBtn.disabled = true;
    });
    
    function resetForm() {
        document.getElementById("linkInput").value = "";
        titleSection.style.display = "none";
        pinForm.classList.remove('was-validated');
    }
    
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
    
    // Check URL button click
    document.getElementById("checkUrlBtn").addEventListener("click", function() {
        const linkInput = document.getElementById("linkInput");
        
        if (!linkInput.value) {
            linkInput.classList.add('is-invalid');
            return;
        }
        
        linkInput.classList.remove('is-invalid');
        
        fetch("/api/pins/create/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken
            },
            body: JSON.stringify({ link: linkInput.value, check_only: true })
        })
        .then(res => res.json())
        .then(data => {
            if (data.platform) {
                titleSection.style.display = "block";
            } else {
                showToast("❌ Invalid link", "error");
            }
        })
        .catch(error => {
            showToast("❌ Network error. Please try again.", "error");
        });
    });

    function getClientLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
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
    
    // Post button click
    document.getElementById("postBtn").addEventListener("click", async function() {
        const linkInput = document.getElementById("linkInput");
        
        if (!linkInput.value) {
            if (!linkInput.value) linkInput.classList.add('is-invalid');
            return;
        }
        
        linkInput.classList.remove('is-invalid');

        let locationData = {};
        try {
            const position = await getClientLocation();
            locationData = position;
        } catch (error) {
            // console.log('Could not get client location, falling back to IP-based:', error);
        }
        
        fetch("/api/pins/create/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken
            },
            body: JSON.stringify({ 
                link: linkInput.value, 
                ...locationData
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                const marker = createMarkerWithPin(data);
                markers.addLayer(marker);
                
                // Open popup for the new marker
                marker.openPopup();
                
                // Center map on new pin without triggering a reload
                map.panTo([data.latitude, data.longitude], {
                    animate: true,
                    duration: 1
                });
                
                showToast("✅ Pin posted successfully!");
                pinModal.hide();
                resetForm();
            } else {
                showToast("❌ Error posting pin", "error");
            }
        })
        .catch(error => {
            showToast("❌ Network error. Please try again.", "error");
        });
    });
});
