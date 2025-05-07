// Application Configuration
const config = {
    apiBaseUrl: 'http://localhost:8000',  // Change this to your actual API URL
    tomtomApiKey: 'Qqst70YPz8boMNRdGfbXk7vcMCNnJpYK'   // Replace with your TomTom API key
};

// DOM Elements
const mapElement = document.getElementById('map');
const uploadModelsBtn = document.getElementById('uploadModelsBtn');
const uploadCSVBtn = document.getElementById('uploadCSVBtn');
const sampleDataBtn = document.getElementById('sampleDataBtn');
const modelModal = document.getElementById('modelModal');
const csvModal = document.getElementById('csvModal');
const modelForm = document.getElementById('modelForm');
const csvForm = document.getElementById('csvForm');
const closeButtons = document.querySelectorAll('.close');

// State management
let map;
let markers = [];
let trafficData = [];
let stats = {
    congestion: { High: 0, Medium: 0, Low: 0 },
    incident: { Yes: 0, No: 0 },
    disruption: { Heavy: 0, Normal: 0 }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    checkAPIStatus();
});

// Initialize TomTom Map
function initMap() {
    map = tt.map({
        key: config.tomtomApiKey,
        container: mapElement,
        center: [-74.0060, 40.7128],  // Default center (New York)
        zoom: 13,
        style: 'tomtom://vector/1/basic-main'
    });

    map.addControl(new tt.FullscreenControl());
    map.addControl(new tt.NavigationControl());
    map.addControl(new tt.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        trackUserLocation: true
    }));
}

// Setup event listeners
function setupEventListeners() {
    // Modal open buttons
    uploadModelsBtn.addEventListener('click', () => modelModal.style.display = 'block');
    uploadCSVBtn.addEventListener('click', () => csvModal.style.display = 'block');
    sampleDataBtn.addEventListener('click', loadSampleData);

    // Modal close buttons
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modelModal.style.display = 'none';
            csvModal.style.display = 'none';
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modelModal) modelModal.style.display = 'none';
        if (event.target === csvModal) csvModal.style.display = 'none';
    });

    // Form submissions
    modelForm.addEventListener('submit', handleModelUpload);
    csvForm.addEventListener('submit', handleCSVUpload);
}

// Check if API is running and which models are loaded
async function checkAPIStatus() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/`);
        const data = await response.json();
        
        if (data.status === 'API is running') {
            console.log('API Status:', data);
            
            // Update UI based on loaded models
            if (data.models_loaded && data.models_loaded.length > 0) {
                // Show which models are loaded
                console.log('Loaded models:', data.models_loaded);
            } else {
                console.log('No models loaded. Please upload models.');
            }
        }
    } catch (error) {
        console.error('Error checking API status:', error);
        alert('Cannot connect to the API server. Please ensure the backend is running.');
    }
}

// Handle model upload
async function handleModelUpload(event) {
    event.preventDefault();
    
    const modelType = document.getElementById('modelType').value;
    const modelFile = document.getElementById('modelFile').files[0];
    
    if (!modelFile) {
        alert('Please select a model file (.pkl)');
        return;
    }
    
    const formData = new FormData();
    formData.append('model_type', modelType);
    formData.append('model_file', modelFile);
    
    try {
        const response = await fetch(`${config.apiBaseUrl}/upload-model`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            modelModal.style.display = 'none';
            modelForm.reset();
        } else {
            alert(`Error: ${result.detail}`);
        }
    } catch (error) {
        console.error('Error uploading model:', error);
        alert('Failed to upload model. Please try again.');
    }
}

// Handle CSV upload
async function handleCSVUpload(event) {
    event.preventDefault();
    
    const csvFile = document.getElementById('csvFile').files[0];
    
    if (!csvFile) {
        alert('Please select a CSV file');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', csvFile);
    
    try {
        const response = await fetch(`${config.apiBaseUrl}/upload-csv`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            trafficData = result.results;
            updateMap(trafficData);
            csvModal.style.display = 'none';
            csvForm.reset();
        } else {
            alert(`Error: ${result.detail}`);
        }
    } catch (error) {
        console.error('Error processing CSV:', error);
        alert('Failed to process CSV. Please try again.');
    }
}

// Load sample data for demonstration
async function loadSampleData() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/sample-predict`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            trafficData = result.results;
            updateMap(trafficData);
        } else {
            alert(`Error: ${result.detail}`);
        }
    } catch (error) {
        console.error('Error loading sample data:', error);
        alert('Failed to load sample data. Please try again.');
    }
}

// Update map with traffic data
function updateMap(data) {
    // Clear existing markers
    clearMarkers();
    
    // Reset statistics
    resetStats();
    
    // Add new markers
    data.forEach((location, index) => {
        addMarker(location, index);
        updateStats(location.predictions);
    });
    
    // Update statistics display
    displayStats();
    
    // Fit map to markers if we have any
    if (markers.length > 0) {
        fitMapToMarkers();
    }
}

// Add a marker to the map
function addMarker(location, id) {
    // Create custom marker element
    const markerElement = document.createElement('div');
    markerElement.className = 'custom-marker';
    
    // Style marker based on predictions
    const predictions = location.predictions;
    let markerColor = '#3498db'; // Default blue
    
    if (predictions) {
        // Change marker color based on congestion level
        if (predictions.congestion === 'High') {
            markerColor = '#e74c3c'; // Red
        } else if (predictions.congestion === 'Medium') {
            markerColor = '#f39c12'; // Orange
        } else if (predictions.congestion === 'Low') {
            markerColor = '#2ecc71'; // Green
        }
        
        // Add border for incidents
        if (predictions.incident === 'Yes') {
            markerElement.style.border = '3px solid #9b59b6'; // Purple border
        }
        
        // Add pulsing effect for heavy disruption
        if (predictions.disruption === 'Heavy') {
            markerElement.classList.add('pulsing');
        }
    }
    
    markerElement.style.backgroundColor = markerColor;
    markerElement.style.width = '20px';
    markerElement.style.height = '20px';
    markerElement.style.borderRadius = '50%';
    
    // Create the marker
    const marker = new tt.Marker({
        element: markerElement,
        anchor: 'bottom'
    })
    .setLngLat([location.longitude, location.latitude])
    .addTo(map);
    
    // Create popup with prediction details
    const popupContent = createPopupContent(location, id);
    
    const popup = new tt.Popup({
        offset: 25,
        closeButton: false
    }).setHTML(popupContent);
    
    // Add event listeners to marker
    marker.getElement().addEventListener('mouseenter', () => {
        popup.setLngLat([location.longitude, location.latitude]).addTo(map);
        showLocationDetails(location, id);
    });
    
    marker.getElement().addEventListener('mouseleave', () => {
        popup.remove();
    });
    
    marker.getElement().addEventListener('click', () => {
        showLocationDetails(location, id);
    });
    
    // Store marker reference
    markers.push({ id, marker, location });
}

// Create popup HTML content
function createPopupContent(location, id) {
    const predictions = location.predictions;
    
    // If no predictions available
    if (!predictions) {
        return `<div class="marker-popup">
            <h3>Location #${id}</h3>
            <p>No prediction data available</p>
        </div>`;
    }
    
    // Create HTML for each prediction
    return `
        <div class="marker-popup">
            <h3>Traffic Conditions</h3>
            <div class="prediction-item">
                <span class="prediction-label">Congestion:</span>
                <span class="prediction-value ${predictions.congestion.toLowerCase()}">${predictions.congestion}</span>
            </div>
            <div class="prediction-item">
                <span class="prediction-label">Incident:</span>
                <span class="prediction-value ${predictions.incident.toLowerCase()}">${predictions.incident}</span>
            </div>
            <div class="prediction-item">
                <span class="prediction-label">Disruption:</span>
                <span class="prediction-value ${predictions.disruption.toLowerCase()}">${predictions.disruption}</span>
            </div>
            <p style="margin-top: 5px; font-size: 12px;">Lat: ${location.latitude.toFixed(6)}, Lng: ${location.longitude.toFixed(6)}</p>
        </div>
    `;
}

// Show location details in the side panel
function showLocationDetails(location, id) {
    const locationInfo = document.getElementById('locationInfo');
    const predictions = location.predictions;
    
    if (!predictions) {
        locationInfo.innerHTML = `
            <h3>Location #${id}</h3>
            <p>No prediction data available</p>
        `;
        return;
    }
    
    // Build HTML for location details
    let detailsHTML = `
        <h3>Location #${id}</h3>
        <p class="coordinates">
            Latitude: ${location.latitude.toFixed(6)}<br>
            Longitude: ${location.longitude.toFixed(6)}
        </p>
        <h4>Traffic Predictions:</h4>
        <div class="prediction-details">
    `;
    
    // Add prediction details with colored indicators
    if (predictions.congestion) {
        detailsHTML += `
            <div class="detail-item">
                <span class="detail-label">Congestion Level:</span>
                <span class="prediction-value ${predictions.congestion.toLowerCase()}">${predictions.congestion}</span>
            </div>
        `;
    }
    
    if (predictions.incident) {
        detailsHTML += `
            <div class="detail-item">
                <span class="detail-label">Incident Detected:</span>
                <span class="prediction-value ${predictions.incident.toLowerCase()}">${predictions.incident}</span>
            </div>
        `;
    }
    
    if (predictions.disruption) {
        detailsHTML += `
            <div class="detail-item">
                <span class="detail-label">Traffic Disruption:</span>
                <span class="prediction-value ${predictions.disruption.toLowerCase()}">${predictions.disruption}</span>
            </div>
        `;
    }
    
    detailsHTML += `
        </div>
        <div class="analysis">
            <h4>Traffic Analysis</h4>
            <p>${generateTrafficAnalysis(predictions)}</p>
        </div>
    `;
    
    locationInfo.innerHTML = detailsHTML;
}

// Generate traffic analysis text based on predictions
function generateTrafficAnalysis(predictions) {
    let analysis = '';
    
    if (predictions.congestion === 'High' && predictions.disruption === 'Heavy') {
        analysis = 'Severe traffic conditions detected. Expect significant delays. ';
        
        if (predictions.incident === 'Yes') {
            analysis += 'Incident reported in this area is contributing to the disruption.';
        } else {
            analysis += 'No incidents reported, but heavy congestion is causing major delays.';
        }
    } else if (predictions.congestion === 'Medium') {
        analysis = 'Moderate traffic conditions. ';
        
        if (predictions.disruption === 'Heavy') {
            analysis += 'Traffic flow is disrupted and may cause delays.';
        } else {
            analysis += 'Traffic is flowing steadily with minor slowdowns.';
        }
    } else if (predictions.congestion === 'Low') {
        analysis = 'Traffic is flowing smoothly. ';
        
        if (predictions.incident === 'Yes') {
            analysis += 'There is an incident reported, but it\'s not significantly affecting traffic flow.';
        } else if (predictions.disruption === 'Heavy') {
            analysis += 'Despite low congestion, there is some disruption to normal traffic patterns.';
        } else {
            analysis += 'No issues detected.';
        }
    }
    
    return analysis;
}

// Clear all markers from the map
function clearMarkers() {
    markers.forEach(marker => {
        marker.marker.remove();
    });
    markers = [];
}

// Reset traffic statistics
function resetStats() {
    stats = {
        congestion: { High: 0, Medium: 0, Low: 0 },
        incident: { Yes: 0, No: 0 },
        disruption: { Heavy: 0, Normal: 0 }
    };
}

// Update statistics based on predictions
function updateStats(predictions) {
    if (!predictions) return;
    
    if (predictions.congestion) {
        stats.congestion[predictions.congestion]++;
    }
    
    if (predictions.incident) {
        stats.incident[predictions.incident]++;
    }
    
    if (predictions.disruption) {
        stats.disruption[predictions.disruption]++;
    }
}

// Display statistics in the UI
function displayStats() {
    // Update congestion stats
    document.getElementById('highCongestion').textContent = stats.congestion.High;
    document.getElementById('mediumCongestion').textContent = stats.congestion.Medium;
    document.getElementById('lowCongestion').textContent = stats.congestion.Low;
    
    // Update incident stats
    document.getElementById('yesIncident').textContent = stats.incident.Yes;
    document.getElementById('noIncident').textContent = stats.incident.No;
    
    // Update disruption stats
    document.getElementById('heavyDisruption').textContent = stats.disruption.Heavy;
    document.getElementById('normalDisruption').textContent = stats.disruption.Normal;
}

// Fit map view to contain all markers
function fitMapToMarkers() {
    if (markers.length === 0) return;
    
    const bounds = new tt.LngLatBounds();
    
    markers.forEach(marker => {
        bounds.extend(new tt.LngLat(
            marker.location.longitude,
            marker.location.latitude
        ));
    });
    
    map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15
    });
}

// Add this extra CSS to style the markers
const style = document.createElement('style');
style.textContent = `
    .custom-marker {
        cursor: pointer;
        box-shadow: 0 0 5px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
    }
    
    .custom-marker:hover {
        transform: scale(1.2);
    }
    
    .pulsing {
        animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(231, 76, 60, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(231, 76, 60, 0);
        }
    }
    
    .prediction-details {
        margin-top: 10px;
        margin-bottom: 15px;
    }
    
    .detail-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        align-items: center;
    }
    
    .detail-label {
        font-weight: 500;
    }
    
    .coordinates {
        background-color: #f8f9fa;
        padding: 8px;
        border-radius: 4px;
        margin: 10px 0;
        font-size: 14px;
    }
    
    .analysis {
        background-color: #f2f4f6;
        padding: 10px;
        border-radius: 6px;
        margin-top: 15px;
    }
    
    .analysis h4 {
        margin-bottom: 8px;
    }
`;
document.head.appendChild(style);