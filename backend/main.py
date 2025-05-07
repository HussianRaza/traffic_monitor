from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pickle
import pandas as pd
import numpy as np
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import io
import json
import logging
import os
from fastapi.staticfiles import StaticFiles

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Traffic Monitoring System API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models paths
MODEL_PATHS = {
    "congestion": "models/congestion_model.pkl",
    "incident": "models/incident_model.pkl",
    "disruption": "models/disruption_model.pkl"
}

# Create models directory if it doesn't exist
os.makedirs("models", exist_ok=True)

# Global variable to store loaded models
models = {}

# Load models function
def load_models():
    try:
        for model_name, model_path in MODEL_PATHS.items():
            if os.path.exists(model_path):
                with open(model_path, 'rb') as file:
                    models[model_name] = pickle.load(file)
                logger.info(f"Successfully loaded {model_name} model")
            else:
                logger.warning(f"Model file not found: {model_path}")
    except Exception as e:
        logger.error(f"Error loading models: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading models: {str(e)}")

# Pydantic models for API requests and responses
class LocationData(BaseModel):
    latitude: float
    longitude: float
    features: Dict[str, Any]

class PredictionRequest(BaseModel):
    locations: List[LocationData]

class PredictionResponse(BaseModel):
    location_id: int
    latitude: float
    longitude: float
    predictions: Dict[str, str]

class UploadModelRequest(BaseModel):
    model_type: str

@app.on_event("startup")
async def startup_event():
    """Load models on startup if they exist"""
    try:
        load_models()
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint to check API status"""
    return {"status": "API is running", "models_loaded": list(models.keys())}

@app.post("/upload-model")
async def upload_model(
    model_type: str = Form(...),
    model_file: UploadFile = File(...)
):
    """Endpoint to upload model files"""
    if model_type not in MODEL_PATHS:
        raise HTTPException(status_code=400, detail=f"Invalid model type. Must be one of {list(MODEL_PATHS.keys())}")
    
    try:
        # Save the uploaded model
        model_path = MODEL_PATHS[model_type]
        with open(model_path, "wb") as f:
            content = await model_file.read()
            f.write(content)
        
        # Load the new model
        with open(model_path, "rb") as f:
            models[model_type] = pickle.load(f)
        
        return {"message": f"Successfully uploaded and loaded {model_type} model"}
    except Exception as e:
        logger.error(f"Error uploading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading model: {str(e)}")

@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """Endpoint to upload CSV data and get predictions"""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        
        # Check if required columns exist
        required_columns = ["latitude", "longitude"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=400, detail=f"CSV must contain columns: {required_columns}")
        
        # Make predictions
        results = []
        for idx, row in df.iterrows():
            # Extract features (all columns except lat/long)
            features = row.drop(['latitude', 'longitude']).to_dict()
            
            # Make predictions using all available models
            predictions = {}
            for model_name, model in models.items():
                try:
                    # Prepare features for prediction (adapt as needed for your models)
                    X = np.array([list(features.values())])
                    pred = model.predict(X)[0]
                    predictions[model_name] = str(pred)
                except Exception as e:
                    predictions[model_name] = f"Error: {str(e)}"
            
            results.append({
                "location_id": idx,
                "latitude": row['latitude'],
                "longitude": row['longitude'],
                "predictions": predictions
            })
        
        return {"results": results}
    except Exception as e:
        logger.error(f"Error processing CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")

@app.post("/predict", response_model=List[PredictionResponse])
async def predict(request: PredictionRequest):
    """Endpoint to get predictions for multiple locations"""
    if not models:
        raise HTTPException(status_code=500, detail="No models have been loaded")
    
    results = []
    for idx, location in enumerate(request.locations):
        # Extract features
        features = location.features
        
        # Make predictions
        predictions = {}
        for model_name, model in models.items():
            try:
                # Convert features to array format expected by the model
                feature_values = list(features.values())
                X = np.array([feature_values])
                pred = model.predict(X)[0]
                
                # Map numerical predictions to descriptive labels if needed
                if model_name == "congestion":
                    predictions[model_name] = ["Low", "Medium", "High"][int(pred)] if isinstance(pred, (int, np.integer)) else str(pred)
                elif model_name == "incident":
                    predictions[model_name] = "Yes" if pred == 1 or pred == "1" or pred == True else "No"
                elif model_name == "disruption":
                    predictions[model_name] = "Heavy" if pred == 1 or pred == "1" or pred == True else "Normal"
                else:
                    predictions[model_name] = str(pred)
            except Exception as e:
                logger.error(f"Prediction error for {model_name}: {str(e)}")
                predictions[model_name] = "Error"
        
        results.append(
            PredictionResponse(
                location_id=idx,
                latitude=location.latitude,
                longitude=location.longitude,
                predictions=predictions
            )
        )
    
    return results

@app.post("/sample-predict")
async def sample_predict():
    """Endpoint to get sample predictions for demo purposes"""
    sample_locations = [
        {"latitude": 40.7128, "longitude": -74.0060, "predictions": {"congestion": "High", "incident": "No", "disruption": "Heavy"}},
        {"latitude": 34.0522, "longitude": -118.2437, "predictions": {"congestion": "Medium", "incident": "Yes", "disruption": "Heavy"}},
        {"latitude": 41.8781, "longitude": -87.6298, "predictions": {"congestion": "Low", "incident": "No", "disruption": "Normal"}},
        {"latitude": 51.5074, "longitude": -0.1278, "predictions": {"congestion": "High", "incident": "No", "disruption": "Heavy"}},
        {"latitude": 48.8566, "longitude": 2.3522, "predictions": {"congestion": "Medium", "incident": "No", "disruption": "Normal"}}
    ]
    
    return {"results": sample_locations}

# Mount the static files directory
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)