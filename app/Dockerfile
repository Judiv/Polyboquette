FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# On copie tout le contenu du dossier local vers /app dans le conteneur
COPY . /app

# On lance gunicorn depuis /app
CMD ["gunicorn", "server:app", "--bind", "0.0.0.0:5000"]