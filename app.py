from mangum import Mangum
from fastapi import FastAPI

from glaze.slack_app import create_app

app: FastAPI = create_app()
handler = Mangum(app)
