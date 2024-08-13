# CDK AutoScaling Instance Refresh

An experiment to understand the behaviour of [Instance Refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-instance-refresh.html) in an AutoScaling Group 
and whether it can replace custom logic within the Guardian's current CD platform Riff-Raff.

## Tested scenarios
A number of scenarios are tested, with a starting point of a healthy ASG.

### A failing heathcheck
Instance Refresh has automatic rollback behaviour which starts after one hour:

> One-hour timeout: When an instance refresh is unable to continue making replacements because it is waiting to replace instances on standby or protected from scale in, 
> or the new instances do not pass their health checks, Amazon EC2 Auto Scaling keeps retrying for an hour. 
> It also provides a status message to help you resolve the issue. 
> If the problem persists after an hour, the operation fails. The intention is to give it time to recover if there is a temporary issue.
> – https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-overview.html#instance-refresh-limitations

> Auto rollback: Amazon EC2 Auto Scaling automatically reverses what was deployed if the instance refresh fails for some reason 
> or if any CloudWatch alarms you specify go into the ALARM state.
> – https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-rollback.html

To test, deploy artifact 500, which has a failing healthcheck (that always returns 500), and watch the instance refresh log.

```sh
./script/deploy 500
```

### Scale out _during_ deployment
The theory here is scaling events continue whilst an instance refresh is in progress.
The application is configured to scale up when the load balancer is receiving more than five requests per minute.

To test:
- Make lots of requests to the service via:
    ```sh
    ./script/request
    ```
- Deploy a change:
    ```sh
    ./script/deploy ABC
    ```
- Watch the ASG activity log, and instance refresh log

### Scale in _during_ deployment
This test is incomplete.

The theory here is scaling events continue whilst an instance refresh is in progress.

To test:
- TBD

### How do the various timeouts and durations work together?
This test is incomplete.

There are a number of different timeouts in an autoscaling stack, for example:
- Healthcheck grace period
- Default instance warmup
- ALB deregistration delay

This test is to understand how these work together. For example:
- Should they be multiples of each other?
- Does a high value of one change how long an instance refresh completes?
