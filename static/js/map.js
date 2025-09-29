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
    minZoom: 4,  // Prevents zooming out beyond this level
    maxZoom: 18,  // maximum zoom level too
    maxBounds: [[-90, -180], [90, 180]],  // Set world boundaries
    maxBoundsViscosity: 1.0  // Prevents bouncing when hitting the edge
}).setView([50, 0], 4);  // Start at zoom level 4 

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
            platformName = 'YouTube Shorts';
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
    
    // Format date
    const createdDate = new Date(pin.created_at);
    const formattedDate = createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    return `
        <div class="custom-popup">
            <div class="popup-header">
                <div class="platform-badge ${platformClass}">${platformName}</div>
            </div>
            <div class="popup-content">
                <div class="popup-link">${pin.link}</div>
                <div class="popup-date">
                    <i class="far fa-clock"></i> ${formattedDate}
                </div>
            </div>
            <div class="popup-actions">
                <a href="${pin.link}" target="_blank" class="popup-button ${buttonClass}">
                    <i class="fas fa-external-link-alt"></i> Open Link
                </a>
            </div>
        </div>
    `;
}

// Load pins from the server
function loadPins() {
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
                let marker = L.marker([pin.latitude, pin.longitude]);
                marker.bindPopup(createPopupContent(pin), {
                    maxWidth: 300,
                    className: 'custom-popup-container'
                });
                markers.addLayer(marker);
            });
        });
}

let loadPinsTimeout;
function debouncedLoadPins() {
    clearTimeout(loadPinsTimeout);
    loadPinsTimeout = setTimeout(loadPins, 300);
}

// Map event listeners
map.whenReady(loadPins);
map.on('moveend', debouncedLoadPins);

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
                // showToast(data.error || "❌ Invalid link", "error");
                showToast("❌ Invalid link", "error");
            }
        })
        .catch(error => {
            showToast("❌ Network error. Please try again.", "error");
            // console.error('Error:', error);
        });
    });

    function getClientLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                // reject(new Error('Geolocation is not supported by this browser.'));
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
                let marker = L.marker([data.latitude, data.longitude]);
                marker.bindPopup(createPopupContent(data), {
                    maxWidth: 300,
                    className: 'custom-popup-container'
                });
                markers.addLayer(marker);
                
                // Center map on new pin
                map.setView([data.latitude, data.longitude], 10);
                
                showToast("✅ Pin posted successfully!");
                pinModal.hide();
                resetForm();
            } else {
                // showToast(data.error || "❌ Error posting pin", "error");
                showToast("❌ Error posting pin", "error");
            }
        })
        .catch(error => {
            showToast("❌ Network error. Please try again.", "error");
            // console.error('Error:', error);
        });
    });
});
