from django.urls import path

from . import views

urlpatterns = [
    path("meta", views.meta, name="meta"),
    path("health", views.health, name="health"),
    path("auth/register", views.register, name="register"),
    path("auth/login", views.login, name="login"),
    path("auth/google", views.google_login, name="google-login"),
    path("auth/me", views.me, name="me"),
    path("auth/logout", views.logout, name="logout"),
    path("notifications", views.notifications, name="notifications"),
    path("notifications/<int:notification_id>/read", views.read_notification, name="notification-read"),

    path("farmer/overview", views.farmer_overview, name="farmer-overview"),
    path("farmer/scans", views.farmer_scans, name="farmer-scans"),
    path("scans", views.create_scan, name="create-scan"),
    path("scans/<int:scan_id>", views.scan_detail, name="scan-detail"),

    path("weather", views.weather_view, name="weather"),
    path("weather/shelf-impact", views.weather_shelf_impact, name="weather-shelf-impact"),

    path("storage/facilities", views.storage_facilities, name="storage-facilities"),
    path("storage/bookings", views.farmer_bookings, name="farmer-bookings"),
    path("storage/bookings/<int:booking_id>/cancel", views.cancel_booking, name="cancel-booking"),

    path("support/tickets", views.support_tickets, name="support-tickets"),
    path("support/tickets/<int:ticket_id>", views.ticket_detail, name="ticket-detail"),
    path("support/tickets/<int:ticket_id>/messages", views.ticket_messages, name="ticket-messages"),

    path("provider/insights", views.provider_insights, name="provider-insights"),
    path("provider/fleet", views.provider_fleet, name="provider-fleet"),
    path("provider/fleet/<int:facility_id>", views.provider_fleet_detail, name="provider-fleet-detail"),
    path("provider/fleet/<int:facility_id>/service", views.provider_fleet_service, name="provider-fleet-service"),
    path("provider/farmers", views.provider_farmers, name="provider-farmers"),
    path("provider/farmers/<int:farmer_id>", views.provider_farmer_detail, name="provider-farmer-detail"),
    path("provider/quality-report", views.provider_quality_report, name="provider-quality-report"),
    path("provider/quality-report.csv", views.provider_quality_csv, name="provider-quality-csv"),
    path("provider/operations", views.provider_operations, name="provider-operations"),
    path("provider/bookings/<int:booking_id>", views.provider_booking_status, name="provider-booking-status"),
    path("provider/tickets/<int:ticket_id>/status", views.provider_ticket_status, name="provider-ticket-status"),
    path("provider/ussd/simulate", views.provider_ussd_simulate, name="ussd-simulate"),
    path("provider/ussd/logs", views.provider_ussd_logs, name="ussd-logs"),
    path("ussd", views.ussd_webhook, name="ussd-webhook"),
]
