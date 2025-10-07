window.openRandomPinPopup = false;
window.randomPinId = null;
window.isGoingToRandomPin = false;

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
    } else if (pin.platform && pin.platform.toLowerCase() === 'tiktok' && url) {
        const videoId = pin.platform_data?.video_id;

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

// Store pin data in markers to identify them later
function createMarkerWithPin(pin) {
    let marker = L.marker([pin.latitude, pin.longitude]);
    marker.pinData = pin; // Store pin data for later identification
    marker.bindPopup(createPopupContent(pin), {
        maxWidth: 350,
        className: 'custom-popup-container',
        autoClose: false,  
        closeButton: true 
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
    userInteracted = false;

    // Wait a moment for DOM to settle
    setTimeout(() => {
        const popupElement = e.popup.getElement();
        if (popupElement) {
            // Look for TikTok embeds inside the popup
            const embeds = popupElement.querySelectorAll('.tiktok-embed');
            if (embeds.length > 0) {
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

    // Random pin button functionality
    const randomPinBtn = document.getElementById("randomPinBtn");
    
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


    randomPinBtn.addEventListener("click", function() {
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
                            })
                            .catch(error => {
                                console.error("Error zooming to pin:", error);
                                showToast("⚠️ Could not zoom to pin", "warning");
                                randomPinBtn.disabled = false;
                                randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
                            });
                    }, 1000);
                }, 1600);
            })
            .catch(error => {
                showToast("❌ Error fetching random pin", "error");
                randomPinBtn.disabled = false;
                randomPinBtn.innerHTML = '<i class="fas fa-random"></i>';
            });
    });

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
                showToast(`❌ ${data.error}`, "error");
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
