from .base import *  # noqa: F403
from .base import env

DEBUG = True
SECRET_KEY = env("SECRET_KEY", "dev-only-insecure-key")
ALLOWED_HOSTS = ["*"]
