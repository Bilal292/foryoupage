
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

var map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const ZOOM_THRESHOLD = 10;
let allMarkers = [];

function updateMarkersVisibility() {
    let zoom = map.getZoom();
    allMarkers.forEach(marker => {
        if (zoom >= ZOOM_THRESHOLD) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
    });
}

// Function to create custom popup content
function createPopupContent(pin) {
    // Determine platform icon
    let platformIcon = 'fas fa-link';
    let platformClass = 'default';
    
    if (pin.platform) {
        const platformLower = pin.platform.toLowerCase();
        if (platformLower === 'tiktok') {
            platformIcon = 'fab fa-tiktok';
            platformClass = 'tiktok';
        } else if (platformLower === 'youtube') {
            platformIcon = 'fab fa-youtube';
            platformClass = 'youtube';
        } else if (platformLower === 'instagram') {
            platformIcon = 'fab fa-instagram';
            platformClass = 'instagram';
        }
    }
    
    // Format date
    const createdDate = new Date(pin.created_at);
    const formattedDate = createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    return `
        <div class="custom-popup">
            <div class="popup-header">
                <div class="platform-icon ${platformClass}">
                    <i class="${platformIcon}"></i>
                </div>
                <div class="popup-title">${pin.title}</div>
            </div>
            <div class="popup-content">
                <div class="popup-link">${pin.link}</div>
                <div class="popup-date">Posted: ${formattedDate}</div>
            </div>
            <div class="popup-actions">
                <a href="${pin.link}" target="_blank" class="popup-button">
                    <i class="fas fa-external-link-alt"></i> Open Link
                </a>
            </div>
        </div>
    `;
}

function loadPins() {
    if (map.getZoom() < ZOOM_THRESHOLD) {
        allMarkers.forEach(marker => map.removeLayer(marker));
        allMarkers = [];
        return; // skip loading pins when zoomed out
    }

    let bounds = map.getBounds();
    let sw = bounds.getSouthWest();
    let ne = bounds.getNorthEast();

    fetch(`/api/pins/in_bounds/?sw_lat=${sw.lat}&sw_lng=${sw.lng}&ne_lat=${ne.lat}&ne_lng=${ne.lng}`)
        .then(res => res.json())
        .then(pins => {
            allMarkers.forEach(marker => map.removeLayer(marker));
            allMarkers = [];

            pins.forEach(pin => {
                let marker = L.marker([pin.latitude, pin.longitude]);
                marker.bindPopup(createPopupContent(pin), {
                    maxWidth: 300,
                    className: 'custom-popup-container'
                });
                allMarkers.push(marker);
            });
            updateMarkersVisibility();
        });
}

map.whenReady(loadPins);
map.on('moveend', loadPins);

// UI interactions
const openFormBtn = document.getElementById("openFormBtn");
const popupForm = document.getElementById("popupForm");
const closeFormBtn = document.getElementById("closeFormBtn");
const modalOverlay = document.getElementById("modalOverlay");
const toast = document.getElementById("toast");

openFormBtn.onclick = () => {
    popupForm.style.display = "block";
    modalOverlay.style.display = "block";
};

modalOverlay.onclick = () => {
    popupForm.style.display = "none";
    modalOverlay.style.display = "none";
    resetForm();
};

closeFormBtn.onclick = () => {
    popupForm.style.display = "none";
    modalOverlay.style.display = "none";
    resetForm();
};

function resetForm() {
    document.getElementById("linkInput").value = "";
    document.getElementById("titleInput").value = "";
    document.getElementById("titleSection").style.display = "none";
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

document.getElementById("checkUrlBtn").addEventListener("click", function() {
    let link = document.getElementById("linkInput").value;

    fetch("/api/pins/create/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken
        },
        body: JSON.stringify({ link: link, check_only: true })
    })
    .then(res => res.json())
    .then(data => {
        if (data.platform) {
            document.getElementById("titleSection").style.display = "block";
        } else {
            showToast(data.error || "❌ Invalid link", "error");
        }
    });
});

document.getElementById("postBtn").addEventListener("click", function() {
    let link = document.getElementById("linkInput").value;
    let title = document.getElementById("titleInput").value;

    fetch("/api/pins/create/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken
        },
        body: JSON.stringify({ link: link, title: title })
    })
    .then(res => res.json())
    .then(data => {
        if (data.latitude && data.longitude) {
            let marker = L.marker([data.latitude, data.longitude]);
            marker.bindPopup(createPopupContent(data), {
                maxWidth: 300,
                className: 'custom-popup-container'
            });
            allMarkers.push(marker);
            updateMarkersVisibility();
            showToast("✅ Pin posted successfully!");
            popupForm.style.display = "none";
            modalOverlay.style.display = "none";
            resetForm();
        } else {
            showToast(data.error || "❌ Error posting pin", "error");
        }
    });
});
