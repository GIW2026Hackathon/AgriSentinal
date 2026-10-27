from django.contrib import admin

from .models import (
    AuthToken, Booking, Facility, Notification, Scan, SupportTicket, TicketMessage, User, UssdLog,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "first_name", "last_name", "role", "region", "phone", "is_staff")
    list_filter = ("role", "region", "is_staff")
    search_fields = ("username", "first_name", "last_name", "phone")


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display = ("ref_code", "farmer", "crop", "quality_score", "grade", "recommended_mode", "created_at")
    list_filter = ("crop", "grade", "recommended_mode", "weather_risk")
    search_fields = ("ref_code", "farmer__first_name", "farmer__last_name")


@admin.register(Facility)
class FacilityAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "type", "region", "status", "used_kg", "capacity_kg", "temperature_c")
    list_filter = ("type", "status", "region")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("ref_code", "farmer", "facility", "crop", "quantity_kg", "days", "status", "created_at")
    list_filter = ("status", "crop", "facility__type")


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("ref_code", "farmer", "subject", "category", "status", "priority", "created_at")
    list_filter = ("status", "category", "priority")


@admin.register(UssdLog)
class UssdLogAdmin(admin.ModelAdmin):
    list_display = ("phone", "text", "response", "created_at")
    search_fields = ("phone", "text")


admin.site.register([AuthToken, TicketMessage, Notification])
admin.site.site_header = "AgriSentinel Control"
admin.site.site_title = "AgriSentinel"
