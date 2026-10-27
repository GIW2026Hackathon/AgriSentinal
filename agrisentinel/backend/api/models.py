from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_FARMER = "farmer"
    ROLE_PROVIDER = "provider"
    ROLE_ADMIN = "admin"
    ROLE_CHOICES = [
        (ROLE_FARMER, "Farmer"),
        (ROLE_PROVIDER, "Provider"),
        (ROLE_ADMIN, "Admin"),
    ]
    STAFF_ROLES = (ROLE_PROVIDER, ROLE_ADMIN)

    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_FARMER)
    phone = models.CharField(max_length=24, blank=True, db_index=True)
    region = models.CharField(max_length=80, blank=True)
    farm_name = models.CharField(max_length=120, blank=True)
    lat = models.FloatField(default=-0.3031)
    lng = models.FloatField(default=36.0800)
    google_sub = models.CharField(max_length=64, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class AuthToken(models.Model):
    """Bearer token stored as a SHA-256 digest with a fixed lifetime."""

    key = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tokens")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=timezone.now, db_index=True)


def scan_upload_path(instance, filename):
    stamp = timezone.now().strftime("%Y/%m")
    return f"scans/{stamp}/{filename}"


class Scan(models.Model):
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scans")
    crop = models.CharField(max_length=32, db_index=True)
    ref_code = models.CharField(max_length=16, unique=True)
    image = models.ImageField(upload_to=scan_upload_path)
    original_name = models.CharField(max_length=180, blank=True)

    quality_score = models.IntegerField(default=0)
    grade = models.CharField(max_length=2, default="B")
    grade_label = models.CharField(max_length=40, blank=True)
    freshness_pct = models.IntegerField(default=0)
    ripeness_pct = models.IntegerField(default=0)
    confidence = models.FloatField(default=0)
    defects = models.JSONField(default=list, blank=True)
    metrics = models.JSONField(default=list, blank=True)
    cnn = models.JSONField(default=dict, blank=True)

    shelf_ambient_days = models.FloatField(default=0)
    shelf_cold_days = models.FloatField(default=0)
    recommended_mode = models.CharField(max_length=12, default="cold")
    weather_risk = models.CharField(max_length=12, default="moderate")
    stress_index = models.FloatField(default=0)
    weather = models.JSONField(default=dict, blank=True)
    degradation = models.JSONField(default=list, blank=True)
    recommendations = models.JSONField(default=list, blank=True)
    advisories = models.JSONField(default=list, blank=True)
    model_meta = models.JSONField(default=dict, blank=True)

    location_name = models.CharField(max_length=120, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ref_code} - {self.crop} ({self.quality_score})"

    @property
    def days_gained(self):
        return round(max(0.0, self.shelf_cold_days - self.shelf_ambient_days), 1)

    @property
    def is_at_risk(self):
        return self.quality_score < 60 or self.weather_risk in ("high", "extreme")


class Facility(models.Model):
    TYPE_MOBILE = "mobile"
    TYPE_SOLAR = "solar"
    TYPE_CHOICES = [(TYPE_MOBILE, "Mobile cold unit"), (TYPE_SOLAR, "Solar freezer")]

    STATUS_AVAILABLE = "available"
    STATUS_IN_TRANSIT = "in_transit"
    STATUS_MAINTENANCE = "maintenance"
    STATUS_FULL = "full"
    STATUS_OFFLINE = "offline"
    STATUS_CHOICES = [
        (STATUS_AVAILABLE, "Available"),
        (STATUS_IN_TRANSIT, "In transit"),
        (STATUS_MAINTENANCE, "Maintenance"),
        (STATUS_FULL, "Full"),
        (STATUS_OFFLINE, "Offline"),
    ]

    name = models.CharField(max_length=120)
    code = models.CharField(max_length=16, unique=True)
    type = models.CharField(max_length=12, choices=TYPE_CHOICES, default=TYPE_SOLAR)
    region = models.CharField(max_length=80)
    lat = models.FloatField()
    lng = models.FloatField()
    capacity_kg = models.IntegerField(default=1000)
    used_kg = models.IntegerField(default=0)
    temperature_c = models.FloatField(default=3.0)
    target_temp_c = models.FloatField(default=3.0)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    solar_kw = models.FloatField(default=0)
    battery_pct = models.IntegerField(default=100)
    last_service = models.DateField(default=timezone.now)
    notes = models.TextField(blank=True)
    temp_series = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["type", "name"]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def available_kg(self):
        return max(0, self.capacity_kg - self.used_kg)

    @property
    def utilization(self):
        return round(100 * self.used_kg / max(self.capacity_kg, 1), 1)

    @property
    def service_due(self):
        return self.last_service <= (timezone.localdate() - timedelta(days=45))


class Booking(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    ref_code = models.CharField(max_length=16, unique=True)
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")
    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="bookings")
    scan = models.ForeignKey(Scan, null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings")
    crop = models.CharField(max_length=32)
    quantity_kg = models.IntegerField()
    start_date = models.DateField()
    days = models.IntegerField(default=1)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    total_cost = models.FloatField(default=0)
    notes = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ref_code} {self.crop} {self.quantity_kg}kg"


class SupportTicket(models.Model):
    CATEGORY_CHOICES = [
        ("quality", "Quality scan"),
        ("storage", "Cold storage"),
        ("payment", "Payments"),
        ("ussd", "USSD help"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [("open", "Open"), ("in_progress", "In progress"), ("resolved", "Resolved")]

    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    ref_code = models.CharField(max_length=16, unique=True)
    subject = models.CharField(max_length=160)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="other")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="open")
    priority = models.CharField(max_length=12, default="normal")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class TicketMessage(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    sender = models.CharField(max_length=12, default="farmer")
    author_name = models.CharField(max_length=80, blank=True)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=24, default="system")
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=320, blank=True)
    severity = models.CharField(max_length=12, default="info")
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class UssdLog(models.Model):
    session_id = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=24, db_index=True)
    text = models.CharField(max_length=240, blank=True)
    response = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
