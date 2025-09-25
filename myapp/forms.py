from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ['username', 'password1', 'password2']

class LinkCheckForm(forms.Form):
    url = forms.URLField(widget=forms.URLInput(attrs={"class": "form-control", "placeholder": "Paste your link here"}))

class LinkPostForm(forms.Form):
    title = forms.CharField(max_length=200, widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "Enter a title for your link"}))