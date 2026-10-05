# SAMBHAVYA

### AI-Driven Spatio-Temporal Tracking of Extreme Weather Anomalies in Medium-Range Forecasts

**Smart India Hackathon 2026 · PSID SIH26078 · Ministry of Earth Sciences**

> **Turning uncertain medium-range weather forecasts into localized, probabilistic and actionable extreme-weather intelligence.**

---

## 🌦️ Overview

Extreme weather events such as cyclones, heavy rainfall, heatwaves and cold waves are difficult to predict precisely several days in advance.

Modern Numerical Weather Prediction (NWP) systems generate huge volumes of forecast data, but identifying **where an extreme event is developing, how it is moving, and which locations are most likely to be affected** still requires significant computational processing and expert interpretation.

Existing deep-learning approaches can also suffer from **spectral smoothing**, where extreme rainfall or wind peaks are averaged out during downscaling.

### SAMBHAVYA

SAMBHAVYA is an AI-driven forecasting intelligence pipeline designed to automatically:

- Detect extreme weather anomalies from ensemble forecast data
- Track their movement across space and time
- Estimate multiple possible threat scenarios
- Quantify forecast uncertainty
- Downscale coarse **12 km weather information to 5 km**
- Preserve extreme rainfall and weather intensity
- Apply physics-based quality checks
- Generate localized risk information for decision-making

The system is designed to bridge the gap between **large-scale weather forecasts and hyper-local impact intelligence**.

---

# 🎯 Problem Statement

**Problem Statement ID:** SIH26078

**Title:** AI-Driven Spatio-Temporal Tracking of Extreme Weather Anomalies in Medium-Range Forecasts

**Organization:** Ministry of Earth Sciences (MoES)

**Department:** National Centre for Medium Range Weather Forecasting (NCMRWF)

**Category:** Software

**Theme:** Smart Automation

---

## 🚨 The Problem

Medium-range weather forecasting typically covers a **3–10 day forecast window**.

During this period, atmospheric conditions are highly uncertain, especially for extreme events such as:

- Severe cyclones
- Heavy rainfall
- Heatwaves
- Cold waves
- Strong winds

Traditional forecasting workflows face three major challenges:

### 1. Massive Forecast Data

Global Numerical Weather Prediction systems produce large, multidimensional datasets containing information about atmospheric variables across different locations, altitudes and forecast times.

Manually identifying extreme anomalies from this data is difficult and computationally expensive.

### 2. Forecast Uncertainty

A single deterministic forecast cannot fully represent the uncertainty of a developing weather system.

Different possible forecast outcomes need to be considered.

### 3. Loss of Extreme Peaks

Standard deep-learning architectures such as CNNs and U-Nets tend to smooth spatial information.

As a result, extreme rainfall or wind peaks may become weaker in the final prediction.

This creates a critical gap between:

**12 km coarse forecast → localized 5 km weather intelligence**

---

# 💡 Our Solution

SAMBHAVYA uses a **two-stage AI pipeline**.

### Stage 1 — Spatio-Temporal Anomaly Tracking

A Graph Neural Network processes the ensemble forecast data on a spherical representation of the Earth.

It identifies extreme anomalies and tracks their movement over the forecast period.

The system then groups possible forecast paths into meaningful scenarios such as:

- Landfall near Digha
- Landfall near Sundarbans
- Recurving east

Each scenario is assigned a probability based on ensemble agreement.

---

### Stage 2 — Amplitude-Preserving Downscaling

Once the important threat region is identified, the system focuses computational resources on that area.

A conditional diffusion-based model converts:

**12 km forecast → 5 km localized forecast**

Unlike conventional smoothing-based approaches, the diffusion model is designed to preserve important extreme values such as heavy rainfall peaks.

---

# 🧠 Core Methodology

```text
                    NWP / NEPS-G Ensemble Data
                              │
                              ▼
                    Decode & Pre-process
                              │
                              ▼
                   Anomaly Detection using EFI
                              │
                              ▼
                Spherical GNN Threat Tracking
                              │
                              ▼
                    Ensemble Member Tracking
                              │
                              ▼
                 Scenario Generation & Ranking
                              │
                              ▼
                    Probability / Risk Analysis
                              │
                              ▼
                    Threat Region Extraction
                              │
                              ▼
                 12 km → 5 km Downscaling
                              │
                              ▼
              Diffusion-based Refinement
                              │
                              ▼
                     Physics Quality Gate
                              │
                              ▼
                 Localized Weather Intelligence
                              │
                              ▼
                    Alerts & Visualization
```

---

# 🔬 Stage 1 — Spherical Anomaly Tracking

Weather data is naturally distributed over the spherical Earth.

Instead of treating the Earth as a simple flat image, SAMBHAVYA uses a **spherical/icosahedral representation** for anomaly tracking.

A Graph Neural Network performs message passing between neighbouring atmospheric regions.

The system uses the **Extreme Forecast Index (EFI)** against historical climatological information to identify unusual weather behaviour.

This allows the system to answer:

> **Where is the extreme anomaly?**

and

> **How is it moving over the next several days?**

---

# 🌀 Ensemble-Based Threat Tracking

Instead of depending on only one forecast path, SAMBHAVYA processes multiple ensemble members.

For example:

```text
23 Ensemble Members
        │
        ├── Scenario A → Landfall near Digha
        ├── Scenario B → Landfall near Sundarbans
        └── Scenario C → Recurve East
```

The system calculates the level of agreement between ensemble members.

This produces a **probabilistic forecast instead of a single deterministic prediction**.

### Example

```text
Landfall near Digha       → 57%
Landfall near Sundarbans  → 31%
Recurve East              → 12%
```

This gives forecasters a clearer understanding of **forecast uncertainty**.

---

# 🎯 Threat Tracker

The Threat Tracker provides a geographic view of the developing weather system.

It visualizes:

- Ensemble member tracks
- Scenario paths
- Probability cone
- Threat region
- Expected landfall window
- Ensemble agreement
- Core location
- Key weather drivers

The system can therefore move from:

**"A cyclone may affect this region."**

to:

**"These are the most probable paths, their probabilities, expected timing and affected region."**

---

# 🌧️ Stage 2 — 5 km Downscaling

After identifying the important threat region, SAMBHAVYA performs localized downscaling.

The prototype compares:

### 12 km Input

The original coarse-resolution weather forecast.

### 5 km Output

A high-resolution localized weather field generated using the diffusion model.

The system compares different methods:

- Bilinear interpolation
- Plain U-Net
- SAMBHAVYA Diffusion
- 5 km reference

---

# 🧬 Why Diffusion?

Conventional interpolation and standard neural networks can smooth the weather field.

This can reduce important extreme values.

For example:

```text
Coarse Forecast
      ↓
Interpolation
      ↓
Smooth rainfall field
      ↓
Extreme peak reduced
```

SAMBHAVYA instead uses a diffusion-based generative approach:

```text
12 km Forecast
      ↓
Conditional Diffusion
      ↓
Generate local spatial detail
      ↓
Preserve extreme rainfall structure
      ↓
5 km High-resolution Forecast
```

The objective is to produce realistic local detail **without flattening important extreme-weather peaks**.

---

# ✅ Physics-Informed Quality Gate

AI-generated weather predictions must not only look realistic.

They must also remain physically meaningful.

SAMBHAVYA therefore includes a quality-gate stage before the output is considered ready.

The prototype checks:

- Peak preservation
- Water balance
- Consistency with the 12 km input
- Physical plausibility

Example:

```text
Peak Preservation      ✓ PASS
Water Balance          ✓ PASS
12 km Consistency      ✓ PASS
```

If an output fails an important check, it can be prevented from being published as a reliable forecast product.

---

# 📊 Prototype Dashboard

The prototype provides an end-to-end visualization of the forecasting pipeline.

## 1. Forecast Run

The Forecast Run interface demonstrates how an ensemble weather forecast moves through the processing pipeline.

The pipeline includes:

```text
Receive NEPS-G Run
        ↓
Decode & Chunk
        ↓
Anomaly Fields
        ↓
Screen Globe
        ↓
Track Members
        ↓
Calibrate
        ↓
5 km Downscaling
        ↓
Quality Gate
        ↓
Risk Scoring
        ↓
Ready for Review
```

This provides visibility into how raw forecast information is converted into an actionable weather product.

---

## 2. Threat Tracker

The Threat Tracker displays the developing cyclone and its possible trajectories.

It shows:

- Member tracks
- Scenario paths
- Probability cone
- Threat box
- Hazard categories
- Expected landfall window
- Ensemble agreement

This allows users to understand both **the predicted threat and the uncertainty around it**.

---

## 3. 5 km Downscaling

The downscaling interface compares the coarse forecast with the generated high-resolution result.

The prototype allows comparison between:

**12 km input → 5 km output**

and evaluates whether the extreme rainfall structure is retained.

---

## 4. Quality Gate

The quality-gate interface verifies whether the generated forecast satisfies predefined checks.

Only outputs that pass the required checks should move towards final risk assessment and visualization.

---

# 📈 Example Prototype Result

For the cyclone replay scenario, the prototype demonstrates a 23-member ensemble.

The scenario distribution can be represented as:

| Scenario | Probability |
|---|---:|
| Landfall near Digha | 57% |
| Landfall near Sundarbans | 31% |
| Recurve East | 12% |

The prototype also demonstrates localized downscaling where the diffusion-based approach preserves the rainfall peak more effectively than conventional smoothing approaches.

These values are used as **illustrative prototype/replay values** to demonstrate the system workflow.

---

# 🛠️ Technology Stack

### AI / Machine Learning

- PyTorch
- JAX
- Deep Graph Library (DGL)
- Hugging Face Diffusers
- Graph Neural Networks
- Conditional Diffusion Models

### Weather & Scientific Computing

- Xarray
- Dask
- MetPy
- NumPy
- ERA5 / IMDAA climatological data
- NEPS-G ensemble forecasts
- NCUM forecast data

### Geospatial Processing

- Cartopy
- Geospatial raster processing
- Spherical / icosahedral mesh representation

### Backend / API

- Python
- REST API architecture

### Visualization

- Interactive geographic maps
- Ensemble track visualization
- Probability cones
- Threat boxes
- Rainfall heatmaps
- Risk dashboards

---

# 📚 Datasets

### Historical Baseline

Historical **ERA5 / IMDAA reanalysis data** is used to establish climatological behaviour and identify unusual weather conditions.

### Forecast Data

Historical:

- NEPS-G 12 km ensemble forecasts
- NCUM 12 km forecasts

are used for developing and testing the forecasting pipeline.

### Extreme Event Cases

Historical extreme events such as:

- Cyclone Amphan
- Severe rainfall events
- Major heatwave events

can be used for validation and testing.

---

# ⚙️ Key Features

### 🌪️ Automated Anomaly Detection
Automatically identifies unusual weather patterns from large forecast datasets.

### 🗺️ Spatio-Temporal Threat Tracking
Tracks extreme weather systems across space and time.

### 🎯 Ensemble-Based Forecasting
Uses multiple forecast members instead of relying on a single deterministic path.

### 📊 Probabilistic Scenarios
Converts ensemble uncertainty into understandable scenario probabilities.

### 🔍 Localized Threat Identification
Automatically identifies the geographic region most likely to be affected.

### 🌧️ 5 km Downscaling
Converts coarse 12 km forecast information into localized 5 km weather information.

### 🔥 Extreme Peak Preservation
Designed to preserve important rainfall and weather-intensity peaks.

### 🧪 Physics-Based Quality Control
Checks generated forecasts before they are considered ready for use.

### 🚨 Risk & Alert Generation
Supports localized risk categories such as:

- Low
- Moderate
- Severe

### 📍 Geographic Visualization
Displays weather threats through maps, tracks, probability cones and localized impact zones.

---

# 🆚 Existing Approach vs SAMBHAVYA

| Existing Approach | SAMBHAVYA |
|---|---|
| Manual interpretation of large forecast datasets | Automated anomaly detection |
| Often relies on deterministic forecasts | Uses ensemble forecasts |
| Broad regional warnings | Localized threat identification |
| Difficult to represent uncertainty | Probability-based scenarios |
| 12 km coarse information | 5 km localized information |
| Conventional models may smooth extremes | Diffusion-based amplitude preservation |
| Separate analysis steps | Integrated end-to-end pipeline |
| Limited physical validation | Physics-informed quality gate |
| Forecast information | Actionable weather intelligence |

---

# 🌍 Societal Impact

## 🛡️ Disaster Management

Emergency response agencies can receive more localized information about:

- Cyclone paths
- Heavy rainfall
- Flood-prone regions
- Strong winds

This can support earlier and more targeted deployment of resources.

---

## 🌾 Agriculture

Farmers can receive earlier information about localized:

- Heavy rainfall
- Heatwaves
- Cold waves
- Frost
- Hail events

This can help them make decisions regarding harvesting, irrigation and crop protection.

---

## 🏙️ Local Administration

District and local authorities can use localized forecasts for:

- Flood preparedness
- Evacuation planning
- Infrastructure protection
- Emergency resource allocation

---

# 🚀 Expected Outcomes

SAMBHAVYA aims to deliver four major components:

### 1. Tracking Core

An AI-based system that automatically detects and tracks extreme weather anomalies.

### 2. Downscaling Core

A diffusion-based model that generates high-resolution 5 km weather information from 12 km forecasts.

### 3. Visualization Dashboard

An interactive dashboard for understanding:

- Weather tracks
- Scenario probabilities
- Threat regions
- Rainfall intensity
- Forecast uncertainty

### 4. Alerting API

A lightweight API capable of providing localized anomaly coordinates and categorized risk information.

---

# 🔮 Future Scope

The system can be extended with:

- Real-time NWP data ingestion
- Live IMD/NCMRWF data integration
- More extreme-weather event categories
- Village-level risk maps
- Automated SMS/mobile alerts
- Multilingual weather alerts
- Voice-based emergency information
- Integration with disaster-management platforms
- Real-time satellite data
- Additional physics-based constraints
- Cloud-based scalable inference

---

# 🏗️ System Architecture

```text
                    ┌──────────────────────┐
                    │  NWP / NEPS-G Data   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Data Pre-processing   │
                    │ Xarray + Dask         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Extreme Anomaly      │
                    │ Detection using EFI  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Spherical GNN        │
                    │ Threat Tracking      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Ensemble Scenarios   │
                    │ + Probability        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Threat Region        │
                    │ Extraction           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Diffusion Model      │
                    │ 12 km → 5 km         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Physics Quality Gate │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Risk & Visualization│
                    │ Dashboard            │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Localized Alerts     │
                    └──────────────────────┘
```

---

# 🎯 Our Vision

SAMBHAVYA aims to transform weather forecasting from:

> **"A broad forecast of what might happen"**

into:

> **"A probabilistic, localized understanding of where extreme weather is most likely to occur and how severe it could be."**

By combining **ensemble forecasting, spherical graph learning, generative diffusion and physics-informed validation**, the system aims to make extreme-weather intelligence more precise, localized and actionable.

---

## 👥 Team

**Team:** SAMBHAVYA

**Smart India Hackathon 2026**

**Problem Statement:** SIH26078

**Organization:** Ministry of Earth Sciences

**Department:** National Centre for Medium Range Weather Forecasting

---

## 📌 Project Status

**Prototype / Research Implementation**

The current prototype demonstrates the complete conceptual workflow:

**Forecast → Anomaly Detection → Ensemble Tracking → Scenario Probability → 5 km Downscaling → Quality Gate → Risk Visualization**

The system is being developed toward a production-ready implementation for real-world extreme-weather forecasting and disaster-management applications.

---

## ⭐ Key Takeaway

**SAMBHAVYA does not simply predict weather.**

It focuses on identifying **where extreme weather is developing, how certain that prediction is, how the threat evolves, and how the coarse forecast can be converted into localized high-resolution information for better decisions.**
