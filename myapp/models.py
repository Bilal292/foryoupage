from django.db import models
from django.contrib.auth.models import User


class Link(models.Model):
    title = models.CharField(max_length=200)
    url = models.URLField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    platform = models.CharField(max_length=100, blank=True, null=True)
    report_count = models.PositiveIntegerField(default=0)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="links", default=1)

    def score(self):
        up = self.votes.filter(value=1).count()
        down = self.votes.filter(value=-1).count()
        return up - down

    def __str__(self):
        return self.title
    
class Vote(models.Model):
    VOTE_CHOICES = (
        (1, "Upvote"),
        (-1, "Downvote"),
    )
    link = models.ForeignKey(Link, related_name="votes", on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)  
    value = models.SmallIntegerField(choices=VOTE_CHOICES)

    class Meta:
        unique_together = ("link", "user")  #ensures one vote per user per link

    def __str__(self):
        return f"{self.user.username} voted {self.get_value_display()} on {self.link.title}"
